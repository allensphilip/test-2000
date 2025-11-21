package handlers

import (
	"database/sql"
	"net/http"
	"time"
	"transcript-analysis-api/utils"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HandleGetAnalysis returns the analysis results for a given job
func HandleGetAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Query the database for the analysis result
		var wer, cer, bleu float64
		var createdAt, updatedAt time.Time
		err := utils.DB.QueryRow(`
			SELECT wer, cer, bleu, created_at, updated_at
			FROM analysis_results
			WHERE file_name = $1
		`, job).Scan(&wer, &cer, &bleu, &createdAt, &updatedAt)

		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{
					"error":   "Analysis not found",
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

// AnalysisResponse represents the structure of analysis results
type AnalysisResponse struct {
	WER       float64   `json:"wer"`
	CER       float64   `json:"cer"`
	BLEU      float64   `json:"bleu"`
	Timestamp time.Time `json:"timestamp"`
}
