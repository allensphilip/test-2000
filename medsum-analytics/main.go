package main

import (
	"embed"
	"fmt"
	"log"
	"net/http"
	"time"
	"transcript-analysis-api/handlers"
	"transcript-analysis-api/subscriber"
	"transcript-analysis-api/utils"

	valkeystore "transcript-analysis-api/valkey"

	ginzap "github.com/gin-contrib/zap"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var webFS embed.FS

//go:embed web/index.html
var indexHTML string

func main() {
	cfg := zap.NewProductionConfig()
	cfg.EncoderConfig.TimeKey = ""
	cfg.EncoderConfig.EncodeDuration = zapcore.MillisDurationEncoder
	logger, err := cfg.Build()
	if err != nil {
		log.Fatalf("cannot initialize logger: %v", err)
	}
    defer logger.Sync()

	// Initialize Valkey
	valkeystore.InitValkey(logger)

	// Initialize PostgreSQL database
    if err := utils.InitDB(logger); err != nil {
        logger.Fatal("failed to init database", zap.Error(err))
    }
	defer utils.CloseDB(logger)

	// Create database schema
    if err := utils.CreateSchema(logger); err != nil {
        logger.Fatal("failed to create database schema", zap.Error(err))
    }

	// Initialize S3
    if err := utils.InitS3(logger); err != nil {
        logger.Fatal("failed to init s3", zap.Error(err))
    }

	// Start pub/sub subscribers in background
	go subscriber.StartSubscribers(logger)

	// Setup HTTP server
    r := gin.New()
    logger.Info("Creating router")

	r.Use(ginzap.Ginzap(logger, time.RFC3339, true))
	r.Use(ginzap.RecoveryWithZap(logger, true))

	// Routes
	// Transcription analysis routes
	r.GET("/transcript-analysis/:job", handlers.HandleGetAnalysis(logger))
	r.GET("/transcript-analysis/list", handlers.HandleListTranscriptionAnalysis(logger))
	r.POST("/transcript-analysis/upload", handlers.HandleTranscriptionUpload(logger))
	r.POST("/transcript-analysis/trigger/:job", handlers.HandleTriggerTranscriptionAnalysis(logger))

	// Summary analysis routes
	r.GET("/summary-analysis/:job", handlers.HandleGetSummaryAnalysis(logger))
	r.GET("/summary-analysis/list", handlers.HandleListSummaryAnalysis(logger))
	r.POST("/summary-analysis/upload", handlers.HandleSummaryUpload(logger))
	r.POST("/summary-analysis/trigger/:job", handlers.HandleTriggerSummaryAnalysis(logger))

	// Health check
	r.GET("/healthcheck", func(ctx *gin.Context) {
		ctx.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	r.GET("/", func(ctx *gin.Context) {
		ctx.Header("Content-Type", "text/html; charset=utf-8")
		ctx.String(http.StatusOK, indexHTML)
	})

    logger.Info("Running on port", zap.String("port", utils.MustGetEnv("APP_PORT")))
	port := utils.MustGetEnv("APP_PORT")
	r.Run(fmt.Sprintf(":%s", port))
}
