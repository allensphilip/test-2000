package subscriber

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
	"transcript-analysis-api/analyzer"
	"transcript-analysis-api/utils"
	valkeystore "transcript-analysis-api/valkey"

	"github.com/valkey-io/valkey-go"
	"go.uber.org/zap"
)

const (
	TranscribeCompleteChannel = "transcribe_complete"
	SummaryCompleteChannel    = "summary_complete"
)

// TranscribeCompletePayload represents the data structure for transcribe_complete events
type TranscribeCompletePayload struct {
	Job             string `json:"job"`
	Bucket          string `json:"bucket"`
	TranscribedFile string `json:"transcribedFile"`
	CorrectedFile   string `json:"correctedFile"`
}

// SummaryCompletePayload represents the data structure for summary_complete events
type SummaryCompletePayload struct {
	Job          string `json:"job"`
	Bucket       string `json:"bucket"`
	OriginalFile string `json:"originalFile"`
	SummaryFile  string `json:"summaryFile"`
}

// StartSubscribers starts both transcription and summary subscribers
func StartSubscribers(logger *zap.Logger) {
	go startSubscriber(logger, TranscribeCompleteChannel, processTranscriptionJob)
	go startSubscriber(logger, SummaryCompleteChannel, processSummaryJob)
}

// startSubscriber is a generic subscriber that handles both transcription and summary messages
func startSubscriber(logger *zap.Logger, channel string, processor func(*zap.Logger, string)) {
	sugar := logger.Sugar()
	sugar.Infow("Message subscriber started",
		"channel", channel)

	ctx := context.Background()
	vkClient := valkeystore.RawClient

	pubSub := vkClient.PubSub()
	defer pubSub.Close()

	// Subscribe to the specified channel
	if err := pubSub.Subscribe(ctx, channel).Err(); err != nil {
		sugar.Errorw("Failed to subscribe to channel",
			"channel", channel,
			"error", err)
		return
	}

	// Listen for messages
	for {
		msg, err := pubSub.ReceiveMessage(ctx)
		if err != nil {
			sugar.Errorw("Failed to receive message",
				"channel", channel,
				"error", err)
			time.Sleep(5 * time.Second) // Wait before retrying
			continue
		}

		// Ensure message is not empty
		if strings.TrimSpace(msg.Message) == "" {
			sugar.Warn("Received empty message from pub/sub")
			return
		}

		// Process the full message asynchronously (message contains JSON payload)
		go processor(logger, msg.Message)
	}
}

// processTranscriptionJob processes transcription analysis jobs
func processTranscriptionJob(logger *zap.Logger, message string) {
	ctx := context.Background()
	sugar := logger.Sugar()
	var payload TranscribeCompletePayload

	// Try to parse as JSON first
	if err := json.Unmarshal([]byte(message), &payload); err != nil {
		// If JSON parsing fails, treat as plain job ID
		unquoted, err := strconv.Unquote(message)
		if err != nil {
			// treat as a plain job id
			job := strings.TrimSpace(message)
			if job == "" {
				sugar.Error("Received empty transcription job message")
				return
			}
			payload = TranscribeCompletePayload{
				Job:             job,
				Bucket:          "medsum-data",
				TranscribedFile: fmt.Sprintf("%s/%s_transcribed.txt", job, job),
				CorrectedFile:   fmt.Sprintf("%s/%s_corrected.txt", job, job),
			}
		} else {
			// treat as plain job
			job := strings.TrimSpace(unquoted)
			if job == "" {
				sugar.Error("Received empty transcription job message")
				return
			}
			payload = TranscribeCompletePayload{
				Job:             job,
				Bucket:          "medsum-data",
				TranscribedFile: fmt.Sprintf("%s/%s_transcribed.txt", job, job),
				CorrectedFile:   fmt.Sprintf("%s/%s_corrected.txt", job, job),
			}
		}
	}

	sugar.Info("Processing transcription analysis request")

	// Perform the analysis with bucket and file paths from the event
	result, err := analyzer.AnalyzeTranscripts(ctx, logger, payload.Bucket, payload.TranscribedFile, payload.CorrectedFile)
	if err != nil {
		sugar.Errorw("Analysis process failed",
			"error", err)
		return
	}

	// Store results in both database and cache
	if err := storeAnalysisResult(logger, "analysis_results", "analysis", payload.Job, result); err != nil {
		sugar.Errorw("Result storage failed",
			"error", err)
		return
	}

	sugar.Info("Transcription analysis completed successfully")
}

// processSummaryJob processes summary analysis jobs
func processSummaryJob(logger *zap.Logger, message string) {
	ctx := context.Background()
	sugar := logger.Sugar()
	var payload SummaryCompletePayload

	// Try to parse as JSON first
	if err := json.Unmarshal([]byte(message), &payload); err != nil {
		// If JSON parsing fails, treat as plain job ID
		unquoted, err := strconv.Unquote(message)
		if err != nil {
			// treat as a plain job id
			job := strings.TrimSpace(message)
			if job == "" {
				sugar.Error("Received empty summary job message")
				return
			}
			payload = SummaryCompletePayload{
				Job:          job,
				Bucket:       "medsum-data",
				OriginalFile: fmt.Sprintf("%s/%s_original.txt", job, job),
				SummaryFile:  fmt.Sprintf("%s/%s_summary.txt", job, job),
			}
		} else {
			// treat as plain job
			job := strings.TrimSpace(unquoted)
			if job == "" {
				sugar.Error("Received empty summary job message")
				return
			}
			payload = SummaryCompletePayload{
				Job:          job,
				Bucket:       "medsum-data",
				OriginalFile: fmt.Sprintf("%s/%s_original.txt", job, job),
				SummaryFile:  fmt.Sprintf("%s/%s_corrected.txt", job, job),
			}
		}
	}

	sugar.Info("Processing summary analysis request")

	// Perform the analysis with bucket and file paths from the event
	result, err := analyzer.AnalyzeSummary(ctx, logger, payload.Bucket, payload.OriginalFile, payload.SummaryFile)
	if err != nil {
		sugar.Errorw("Analysis process failed",
			"error", err)
		return
	}

	// Store results in both database and cache
	if err := storeAnalysisResult(logger, "summary_analysis_results", "summary", payload.Job, result); err != nil {
		sugar.Errorw("Result storage failed",
			"error", err)
		return
	}

	sugar.Info("Summary analysis completed successfully")
}

// storeAnalysisResult stores the analysis result in both database and cache
func storeAnalysisResult(logger *zap.Logger, tableName, cachePrefix, job string, result *analyzer.AnalysisResult) error {
	ctx := context.Background()
	sugar := logger.Sugar()

	// Store in database
	query := fmt.Sprintf(`
		INSERT INTO %s (file_name, wer, cer, bleu, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (file_name) DO UPDATE SET
			wer = EXCLUDED.wer,
			cer = EXCLUDED.cer,
			bleu = EXCLUDED.bleu,
			updated_at = EXCLUDED.updated_at
	`, tableName)

	_, err := utils.DB.ExecContext(ctx, query,
		result.FileName, result.WER, result.CER, result.BLEU, result.Timestamp, result.Timestamp)
	if err != nil {
		sugar.Errorw("Database storage failed",
			"error", err)
		return err
	}

	// Store in cache
	jsonData, err := json.Marshal(result)
	if err != nil {
		sugar.Errorw("Data marshaling failed",
			"error", err)
		return err
	}

	cacheKey := fmt.Sprintf("%s:%s", cachePrefix, job)
	if err := valkeystore.Client.Set(ctx, cacheKey, string(jsonData), 24*time.Hour).Err(); err != nil {
		sugar.Errorw("Cache storage failed",
			"error", err)
		return err
	}

	return nil
}
