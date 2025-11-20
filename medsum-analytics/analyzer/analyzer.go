package analyzer

import (
	"context"
	"fmt"
	"strings"
	"time"
	"transcript-analysis-api/utils"

	"go.uber.org/zap"
)

// AnalysisResult represents the metrics for both transcription and summary analysis
type AnalysisResult struct {
	FileName  string    `json:"file_name"`
	WER       float64   `json:"wer"`
	CER       float64   `json:"cer"`
	BLEU      float64   `json:"bleu"`
	Timestamp time.Time `json:"timestamp"`
}

// AnalyzeTranscripts performs analysis on transcription files
func AnalyzeTranscripts(ctx context.Context, logger *zap.Logger, bucket, originalFilePath, transcribedFilePath string) (*AnalysisResult, error) {
	logger.Info("Starting transcription analysis process")

	// Log high-level operation without sensitive details
	logger.Debug("Processing reference file for transcription analysis")

	// Download original and transcribed files from the specified bucket and paths
	reference, err := downloadFromS3WithBucket(ctx, bucket, originalFilePath)
	if err != nil {
		logger.Error("File download failed", zap.Error(err))
		return nil, fmt.Errorf("failed to download original file: %w", err)
	}
	logger.Debug("Successfully downloaded reference file", zap.Int("size_bytes", len(reference)))

	// Download transcribed file
	hypothesis, err := downloadFromS3WithBucket(ctx, bucket, transcribedFilePath)
	if err != nil {
		logger.Error("File download failed", zap.Error(err))
		return nil, fmt.Errorf("failed to download transcribed file: %w", err)
	}
	logger.Debug("Successfully downloaded hypothesis file", zap.Int("size_bytes", len(hypothesis)))

	// Compute metrics
	metrics, err := computeMetrics(reference, hypothesis)
	if err != nil {
		logger.Error("Metrics computation failed", zap.Error(err))
		return nil, fmt.Errorf("failed to compute metrics: %w", err)
	}

	// Extract job from the file path for identification
	job := extractJobFromPath(transcribedFilePath)
	metrics.FileName = job
	metrics.Timestamp = time.Now().UTC()

	logger.Info("Transcription analysis completed successfully",
		zap.Float64("wer", metrics.WER),
		zap.Float64("cer", metrics.CER),
		zap.Float64("bleu", metrics.BLEU))

	return metrics, nil
}

// AnalyzeSummary performs analysis on summary files
func AnalyzeSummary(ctx context.Context, logger *zap.Logger, bucket, originalFilePath, summaryFilePath string) (*AnalysisResult, error) {
	logger.Info("Starting summary analysis process")

	// Log high-level operation without sensitive details
	logger.Debug("Processing original file for summary analysis")

	// Download original and summary files from the specified bucket and paths
	original, err := downloadFromS3WithBucket(ctx, bucket, originalFilePath)
	if err != nil {
		logger.Error("File download failed", zap.Error(err))
		return nil, fmt.Errorf("failed to download original file: %w", err)
	}
	logger.Debug("Successfully downloaded original file", zap.Int("size_bytes", len(original)))

	// Log high-level operation without sensitive details
	logger.Debug("Processing summary file for analysis")

	summary, err := downloadFromS3WithBucket(ctx, bucket, summaryFilePath)
	if err != nil {
		logger.Error("File download failed", zap.Error(err))
		return nil, fmt.Errorf("failed to download summary file: %w", err)
	}
	logger.Debug("Successfully downloaded summary file", zap.Int("size_bytes", len(summary)))

	// Compute metrics
	metrics, err := computeMetrics(original, summary)
	if err != nil {
		logger.Error("Metrics computation failed", zap.Error(err))
		return nil, fmt.Errorf("failed to compute metrics: %w", err)
	}

	// Extract job from the file path for identification
	job := extractJobFromPath(summaryFilePath)
	metrics.FileName = job
	metrics.Timestamp = time.Now().UTC()

	logger.Info("Summary analysis completed successfully",
		zap.Float64("wer", metrics.WER),
		zap.Float64("cer", metrics.CER),
		zap.Float64("bleu", metrics.BLEU))

	return metrics, nil
}

// computeMetrics calculates WER, CER, and BLEU scores
func computeMetrics(reference, hypothesis string) (*AnalysisResult, error) {
	if reference == "" || hypothesis == "" {
		return nil, fmt.Errorf("reference or hypothesis text is empty")
	}

	wer := ComputeWER(reference, hypothesis)
	cer := ComputeCER(reference, hypothesis)
	bleu := ComputeBLEU(reference, hypothesis)

	return &AnalysisResult{
		WER:  wer,
		CER:  cer,
		BLEU: bleu,
	}, nil
}

// downloadFromS3WithBucket downloads a file from a specified S3 bucket and returns its contents as a string
func downloadFromS3WithBucket(ctx context.Context, bucket, key string) (string, error) {
	data, err := utils.DownloadS3Object(ctx, bucket, key)
	if err != nil {
		return "", fmt.Errorf("failed to download file from S3: %w", err)
	}
	return string(data), nil
}

// extractJobFromPath extracts a job identifier from a file path
// For example: "summaries/job-123/summary.txt" -> "job-123"
func extractJobFromPath(path string) string {
	// Split by '/' and try to find a meaningful identifier
	parts := strings.Split(path, "/")
	if len(parts) >= 2 {
		// Return the second-to-last part (usually the directory containing the file)
		return parts[len(parts)-2]
	}
	// If we can't extract, return the full path
	return path
}
