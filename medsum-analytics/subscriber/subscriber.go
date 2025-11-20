package subscriber

import (
    "context"
    "encoding/json"
    "fmt"
    "strconv"
    "strings"
    "time"
    "transcript-analysis-api/handlers"
    "transcript-analysis-api/analyzer"
    "transcript-analysis-api/utils"
    valkeystore "transcript-analysis-api/valkey"

    "go.uber.org/zap"
)

const (
    TranscribeCompleteChannel = "transcribe_complete"
    SummaryCompleteChannel    = "summary_complete"
    CorrectionsCompleteChannel = "corrections_complete"
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

type CorrectionsEventPayload handlers.CorrectionEventRequest

// StartSubscribers starts both transcription and summary subscribers
func StartSubscribers(logger *zap.Logger) {
    go startSubscriber(logger, TranscribeCompleteChannel, processTranscriptionJob)
    go startSubscriber(logger, SummaryCompleteChannel, processSummaryJob)
    go startSubscriber(logger, CorrectionsCompleteChannel, processCorrections)
}

// startSubscriber is a generic subscriber that handles both transcription and summary messages
func startSubscriber(logger *zap.Logger, channel string, processor func(*zap.Logger, string)) {
	logger.Info("Message subscriber started", zap.String("channel", channel))

	ctx := context.Background()
	rdb := valkeystore.Client

	pubSub := rdb.Subscribe(ctx, channel)
	defer pubSub.Close()

	// Listen for messages
	for {
		msg, err := pubSub.ReceiveMessage(ctx)
		if err != nil {
			logger.Error("Failed to receive message", zap.String("channel", channel), zap.Error(err))
			time.Sleep(5 * time.Second) // Wait before retrying
			continue
		}

		// Ensure message is not empty
		if strings.TrimSpace(msg.Payload) == "" {
			logger.Warn("Received empty message from pub/sub")
			return
		}

		// Process the full message asynchronously (message contains JSON payload)
		go processor(logger, msg.Payload)
	}
}

// processTranscriptionJob processes transcription analysis jobs
func processTranscriptionJob(logger *zap.Logger, message string) {
	ctx := context.Background()
	var payload TranscribeCompletePayload

	// Try to parse as JSON first
	if err := json.Unmarshal([]byte(message), &payload); err != nil {
		// If JSON parsing fails, treat as plain job ID
		unquoted, err := strconv.Unquote(message)
		if err != nil {
			// treat as a plain job id
			job := strings.TrimSpace(message)
			if job == "" {
				logger.Error("Received empty transcription job message")
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
				logger.Error("Received empty transcription job message")
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

	logger.Info("Processing transcription analysis request")

	// Perform the analysis with bucket and file paths from the event
	result, err := analyzer.AnalyzeTranscripts(ctx, logger, payload.Bucket, payload.TranscribedFile, payload.CorrectedFile)
	if err != nil {
		logger.Error("Analysis process failed", zap.Error(err))
		return
	}

	// Store results in database
	if err := storeAnalysisResult(logger, "analysis_results", payload.Job, result); err != nil {
		logger.Error("Result storage failed", zap.Error(err))
		return
	}

	logger.Info("Transcription analysis completed successfully")
}

// processSummaryJob processes summary analysis jobs
func processSummaryJob(logger *zap.Logger, message string) {
	ctx := context.Background()
	var payload SummaryCompletePayload

	// Try to parse as JSON first
	if err := json.Unmarshal([]byte(message), &payload); err != nil {
		// If JSON parsing fails, treat as plain job ID
		unquoted, err := strconv.Unquote(message)
		if err != nil {
			// treat as a plain job id
			job := strings.TrimSpace(message)
			if job == "" {
				logger.Error("Received empty summary job message")
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
				logger.Error("Received empty summary job message")
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

	logger.Info("Processing summary analysis request")

	// Perform the analysis with bucket and file paths from the event
	result, err := analyzer.AnalyzeSummary(ctx, logger, payload.Bucket, payload.OriginalFile, payload.SummaryFile)
	if err != nil {
		logger.Error("Analysis process failed", zap.Error(err))
		return
	}

	// Store results in database
	if err := storeAnalysisResult(logger, "summary_analysis_results", payload.Job, result); err != nil {
		logger.Error("Result storage failed", zap.Error(err))
		return
	}

	logger.Info("Summary analysis completed successfully")
}

func processCorrections(logger *zap.Logger, message string) {
    ctx := context.Background()
    var payload CorrectionsEventPayload
    if err := json.Unmarshal([]byte(message), &payload); err != nil {
        logger.Error("Invalid corrections event payload", zap.Error(err))
        return
    }
    _, err := handlers.IngestCorrectionEvent(ctx, logger, handlers.CorrectionEventRequest(payload))
    if err != nil {
        logger.Error("Corrections event ingest failed", zap.Error(err))
        return
    }
    logger.Info("Corrections event ingested successfully")
}

// storeAnalysisResult stores the analysis result in database
func storeAnalysisResult(logger *zap.Logger, tableName, job string, result *analyzer.AnalysisResult) error {
	ctx := context.Background()

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
		logger.Error("Database storage failed", zap.Error(err))
		return err
	}

	return nil
}
