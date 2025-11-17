package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"transcript-analysis-api/subscriber"
	"transcript-analysis-api/utils"
	valkeystore "transcript-analysis-api/valkey"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HandleTranscriptionUpload handles the upload of transcription files
func HandleTranscriptionUpload(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get job from form data
		job := c.PostForm("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Get the transcription and corrected files (form keys: transcription, corrected)
		transcriptionFile, err := c.FormFile("transcription")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "transcription file is required (form key: transcription)"})
			return
		}

		correctedFile, err := c.FormFile("corrected")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "corrected file is required (form key: corrected)"})
			return
		}

		// Validate file types
		if filepath.Ext(transcriptionFile.Filename) != ".txt" || filepath.Ext(correctedFile.Filename) != ".txt" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only .txt files are allowed"})
			return
		}

		// Open and read transcription (original) file
		originalSrc, err := transcriptionFile.Open()
		if err != nil {
			logger.Error("File processing failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process original file"})
			return
		}
		defer originalSrc.Close()
		// Open and read corrected file
		transcribedSrc, err := correctedFile.Open()
		if err != nil {
			logger.Error("File processing failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process corrected file"})
			return
		}
		defer transcribedSrc.Close()

		// Upload transcribed (original) file to S3
		transcribedKey := fmt.Sprintf("%s/%s_transcribed.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), originalSrc, transcribedKey); err != nil {
			logger.Error("File upload failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload original file"})
			return
		}

		// Upload corrected file to S3 (saved as corrected file)
		correctedKey := fmt.Sprintf("%s/%s_corrected.txt", job, job)
		if err := utils.UploadFile(c.Request.Context(), transcribedSrc, correctedKey); err != nil {
			logger.Error("File upload failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload corrected file"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Files uploaded successfully",
			"job":     job,
			"files": []string{
				transcribedKey,
				correctedKey,
			},
		})
	}
}

// HandleTriggerTranscriptionAnalysis triggers the transcription analysis for a given job
func HandleTriggerTranscriptionAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Create the payload
		payload := subscriber.TranscribeCompletePayload{
			Job:             job,
			Bucket:          "medsum-data",
			TranscribedFile: fmt.Sprintf("%s/%s_transcribed.txt", job, job),
			CorrectedFile:   fmt.Sprintf("%s/%s_corrected.txt", job, job),
		}

		// Publish the message to the transcription channel
		ctx := c.Request.Context()
		message, err := json.Marshal(payload)
		if err != nil {
			logger.Error("Message serialization failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create analysis request"})
			return
		}

		if err := valkeystore.Client.Publish(ctx, subscriber.TranscribeCompleteChannel, string(message)).Err(); err != nil {
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

// HandleListTranscriptionAnalysis returns all transcription analysis results from the database
func HandleListTranscriptionAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Query all results from the database
		rows, err := utils.DB.Query(`
            SELECT id, file_name, wer, cer, bleu, created_at, updated_at
            FROM analysis_results
            ORDER BY created_at DESC
        `)
		if err != nil {
			logger.Error("Database query failed", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve analysis results"})
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
