package testui

import (
    "net/http"

    "github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, basePath string, indexHTML string) {
    if basePath == "" {
        basePath = "/"
    }
    r.GET(basePath, func(ctx *gin.Context) {
        ctx.Header("Content-Type", "text/html; charset=utf-8")
        ctx.String(http.StatusOK, indexHTML)
    })
}