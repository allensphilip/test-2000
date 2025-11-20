package handlers

import (
    "net/http"
    "transcript-analysis-api/utils"

    "github.com/gin-gonic/gin"
)

func HandleMetrics() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "corrections_ingest_total": utils.CorrectionsIngestTotal.Value(),
            "corrections_dedup_events": utils.CorrectionsDedupEvents.Value(),
            "corrections_dedup_words": utils.CorrectionsDedupWords.Value(),
            "corrections_failures_total": utils.CorrectionsFailures.Value(),
        })
    }
}