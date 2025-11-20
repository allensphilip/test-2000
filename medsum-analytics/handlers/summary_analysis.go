package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"transcript-analysis-api/utils"
	valkeystore "transcript-analysis-api/valkey"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const SummaryCompleteChannel = "summary_complete"

type SummaryCompletePayload struct {
	Job          string `json:"job"`
	Bucket       string `json:"bucket"`
	OriginalFile string `json:"originalFile"`
	SummaryFile  string `json:"summaryFile"`
}

// HandleSummaryUpload handles the upload of summary files
func HandleSummaryUpload(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get job from form data
		job := c.PostForm("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Get the original and corrected files
		originalFile, err := c.FormFile("originalFile")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "originalFile is required"})
			return
		}

		correctedFile, err := c.FormFile("correctedFile")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "correctedFile is required"})
			return
		}

		// Validate file types
		if filepath.Ext(originalFile.Filename) != ".txt" || filepath.Ext(correctedFile.Filename) != ".txt" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only .txt files are allowed"})
			return
		}

		// Open and read original file
		originalSrc, err := originalFile.Open()
		if err != nil {
			logger.Error("File processing failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process original file"})
			return
		}
		defer originalSrc.Close()

		// Open and read corrected file
		correctedSrc, err := correctedFile.Open()
		if err != nil {
			logger.Error("File processing failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process corrected file"})
			return
		}
		defer correctedSrc.Close()

		// Upload original file to S3
		originalKey := fmt.Sprintf("%s/%s_original.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), originalSrc, originalKey); err != nil {
			logger.Error("File upload failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload original file"})
			return
		}

		// Upload corrected file to S3 (saved as summary file)
		correctedKey := fmt.Sprintf("%s/%s_summary.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), correctedSrc, correctedKey); err != nil {
			logger.Error("File upload failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload corrected file"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Files uploaded successfully",
			"job":     job,
			"files": []string{
				originalKey,
				correctedKey,
			},
		})
	}
}

// HandleTriggerSummaryAnalysis triggers the summary analysis for a given job
func HandleTriggerSummaryAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Create the payload
		payload := SummaryCompletePayload{
			Job:          job,
			Bucket:       "medsum-data",
			OriginalFile: fmt.Sprintf("%s/%s_original.txt", job, job),
			SummaryFile:  fmt.Sprintf("%s/%s_summary.txt", job, job),
		}

		// Publish the message to the summary channel
		ctx := c.Request.Context()
		message, err := json.Marshal(payload)
		if err != nil {
			logger.Error("Message serialization failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create analysis request"})
			return
		}

		if err := valkeystore.Client.Publish(ctx, SummaryCompleteChannel, string(message)).Err(); err != nil {
			logger.Error("Message publishing failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to trigger analysis"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Analysis triggered successfully",
			"job":     job,
		})
	}
}

// HandleGetSummaryAnalysis returns the summary analysis results for a given job
func HandleGetSummaryAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Query the database for the summary analysis result
		var wer, cer, bleu float64
		var createdAt, updatedAt string
		err := utils.DB.QueryRow(`
			SELECT wer, cer, bleu, created_at, updated_at
			FROM summary_analysis_results
			WHERE file_name = $1
		`, job).Scan(&wer, &cer, &bleu, &createdAt, &updatedAt)

		if err != nil {
			if err.Error() == "sql: no rows in result set" {
				c.JSON(http.StatusNotFound, gin.H{
					"error":   "Summary analysis not found",
					"message": "Analysis may still be processing or job is invalid",
				})
				return
			}

			logger.Error("Analysis retrieval failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve analysis"})
			return
		}

		// Return the analysis result
		c.JSON(http.StatusOK, gin.H{
			"wer":       wer,
			"cer":       cer,
			"bleu":      bleu,
			"timestamp": updatedAt,
		})
	}
}

// HandleListSummaryAnalysis returns all summary analysis results from the database
func HandleListSummaryAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Query all results from the database
		rows, err := utils.DB.Query(`
            SELECT id, file_name, wer, cer, bleu, created_at, updated_at
            FROM summary_analysis_results
            ORDER BY created_at DESC
        `)
		if err != nil {
			logger.Error("Database query failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve summary analysis results"})
			return
		}
		defer rows.Close()

		// Create a slice to store all results
		var results []gin.H
		for rows.Next() {
			var id int
			var fileName string
			var wer, cer, bleu float64
			var createdAt, updatedAt string

			if err := rows.Scan(&id, &fileName, &wer, &cer, &bleu, &createdAt, &updatedAt); err != nil {
				logger.Error("Data scanning failed", zap.Error(err))
				continue
			}

			results = append(results, gin.H{
				"id":         id,
				"file_name":  fileName,
				"wer":        wer,
				"cer":        cer,
				"bleu":       bleu,
				"created_at": createdAt,
				"updated_at": updatedAt,
			})
		}

		if len(results) == 0 {
			c.JSON(http.StatusOK, []gin.H{})
			return
		}

		c.JSON(http.StatusOK, results)
	}
}
