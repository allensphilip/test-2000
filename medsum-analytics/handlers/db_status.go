package handlers

import (
	"context"
	"net/http"
	"time"
	"transcript-analysis-api/utils"

	"github.com/gin-gonic/gin"
)

func HandleDBStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		err := utils.DB.PingContext(ctx)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"connected": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"connected": true})
	}
}
