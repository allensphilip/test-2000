package handlers

import (
	"fmt"
	"net/http"
	"time"
	valkeystore "transcript-analysis-api/valkey"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HandleGetAnalysis returns the analysis results for a given job
func HandleGetAnalysis(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		sugar := logger.Sugar()
		job := c.Param("job")
		if job == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "job is required"})
			return
		}

		// Get the analysis result
		key := fmt.Sprintf("analysis:%s", job)
		data, err := valkeystore.Client.Get(valkeystore.Ctx, key).Result()
		if err != nil {
			// Check if key doesn't exist (analysis not ready yet)
			if err.Error() == "redis: nil" || err.Error() == "valkey: nil" {
				c.JSON(http.StatusNotFound, gin.H{
					"error":   "Analysis not found",
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

// AnalysisResponse represents the structure of analysis results
type AnalysisResponse struct {
	WER       float64   `json:"wer"`
	CER       float64   `json:"cer"`
	BLEU      float64   `json:"bleu"`
	Timestamp time.Time `json:"timestamp"`
}