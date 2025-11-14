package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"transcript-analysis-api/analyzer"
	"transcript-analysis-api/subscriber"
	"transcript-analysis-api/utils"
	valkeystore "transcript-analysis-api/valkey"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HandleSummaryUpload handles the upload of summary files
func HandleSummaryUpload(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		sugar := logger.Sugar()
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
			sugar.Errorw("File processing failed",
				"error", err,
			)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process original file"})
			return
		}
		defer originalSrc.Close()

		// Open and read corrected file
		correctedSrc, err := correctedFile.Open()
		if err != nil {
			sugar.Errorw("File processing failed",
				"error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process corrected file"})
			return
		}
		defer correctedSrc.Close()

		// Upload original file to S3
		originalKey := fmt.Sprintf("%s/%s_original.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), originalSrc, originalKey); err != nil {
			sugar.Errorw("File upload failed",
				"error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload original file"})
			return
		}

		// Upload corrected file to S3 (saved as summary file)
		correctedKey := fmt.Sprintf("%s/%s_summary.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), correctedSrc, correctedKey); err != nil {
			sugar.Errorw("File upload failed",
				"error", err)
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
		sugar := logger.Sugar()
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Create the payload
		payload := subscriber.SummaryCompletePayload{
			Job:         job,
			Bucket:      "medsum-data",
			OriginalFile: fmt.Sprintf("%s/%s_original.txt", job, job),
			SummaryFile:  fmt.Sprintf("%s/%s_summary.txt", job, job),
		}

		// Publish the message to the summary channel
		ctx := c.Request.Context()
		message, err := json.Marshal(payload)
		if err != nil {
			sugar.Errorw("Message serialization failed",
				"error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create analysis request"})
			return
		}

		if err := valkeystore.RawClient.Publish(ctx, subscriber.SummaryCompleteChannel, message).Err(); err != nil {
			sugar.Errorw("Message publishing failed",
				"error", err)
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
		sugar := logger.Sugar()
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Get the analysis result
		key := fmt.Sprintf("summary:%s", job)
		data, err := valkeystore.Client.Get(valkeystore.Ctx, key).Result()
		if err != nil {
			// Check if key doesn't exist (analysis not ready yet)
			if err.Error() == "redis: nil" || err.Error() == "valkey: nil" {
				c.JSON(http.StatusNotFound, gin.H{
					"error":   "Summary analysis not found",
					"message": "Analysis may still be processing or job is invalid",
				})
				return
			}

			sugar.Errorw("Analysis retrieval failed",
				"error", err,
			)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve analysis"})
			return
		}

		// Return the raw JSON data
		c.Header("Content-Type", "application/json")
		c.String(http.StatusOK, data)
	}
}

// HandleListSummaryAnalysis returns all summary analysis results from the database
func HandleListSummaryAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		sugar := logger.Sugar()
		// Query all results from the database
		rows, err := utils.DB.Query(`
			SELECT id, file_name, wer, cer, bleu, created_at, updated_at
			FROM summary_analysis_results
			ORDER BY created_at DESC
		`)
		if err != nil {
			sugar.Errorw("Database query failed",
				"error", err,
			)
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
				sugar.Errorw("Data scanning failed",
					"error", err,
				)
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