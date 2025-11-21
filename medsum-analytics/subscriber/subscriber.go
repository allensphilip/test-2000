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
    JobId        string  `json:"jobId,omitempty"`
    ModelId      string  `json:"modelId,omitempty"`
    PromptId     *int    `json:"promptId,omitempty"`
    ClientId     *int    `json:"clientId,omitempty"`
    ExplanationIds []int `json:"explanationIds,omitempty"`
}

// StartSubscribers starts both transcription and summary subscribers
func StartSubscribers(logger *zap.Logger) {
    go startSubscriber(logger, TranscribeCompleteChannel, processTranscriptionJob)
    go startSubscriber(logger, SummaryCompleteChannel, processSummaryJob)
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
    if err := storeAnalysisResult(logger, "analysis_results", payload.Job, result, nil); err != nil {
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
    if err := storeAnalysisResult(logger, "summary_analysis_results", payload.Job, result, &payload); err != nil {
        logger.Error("Result storage failed", zap.Error(err))
        return
    }

	logger.Info("Summary analysis completed successfully")
}

// storeAnalysisResult stores the analysis result in database
// For summary_analysis_results, optional metadata fields from SummaryCompletePayload are persisted.
func storeAnalysisResult(logger *zap.Logger, tableName, job string, result *analyzer.AnalysisResult, meta *SummaryCompletePayload) error {
    ctx := context.Background()

    var err error
    if tableName == "summary_analysis_results" {
        query := `
            INSERT INTO summary_analysis_results (
                file_name, wer, cer, bleu, job_id, model_id, prompt_id, client_id, explanation_ids, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
            ON CONFLICT (file_name) DO UPDATE SET
                wer = EXCLUDED.wer,
                cer = EXCLUDED.cer,
                bleu = EXCLUDED.bleu,
                job_id = EXCLUDED.job_id,
                model_id = EXCLUDED.model_id,
                prompt_id = EXCLUDED.prompt_id,
                client_id = EXCLUDED.client_id,
                explanation_ids = EXCLUDED.explanation_ids,
                updated_at = EXCLUDED.updated_at
        `

        var promptId interface{} = nil
        var clientId interface{} = nil
        if meta != nil && meta.PromptId != nil { promptId = *meta.PromptId }
        if meta != nil && meta.ClientId != nil { clientId = *meta.ClientId }
        var explanationJSON string = "null"
        if meta != nil {
            if b, e := json.Marshal(meta.ExplanationIds); e == nil {
                explanationJSON = string(b)
            }
        }
        _, err = utils.DB.ExecContext(ctx, query,
            result.FileName,
            result.WER,
            result.CER,
            result.BLEU,
            func() string { if meta != nil { return meta.JobId } else { return "" } }(),
            func() string { if meta != nil { return meta.ModelId } else { return "" } }(),
            promptId,
            clientId,
            explanationJSON,
            result.Timestamp,
            result.Timestamp,
        )
    } else {
        // Default path for transcription analysis_results
        query := fmt.Sprintf(`
            INSERT INTO %s (file_name, wer, cer, bleu, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (file_name) DO UPDATE SET
                wer = EXCLUDED.wer,
                cer = EXCLUDED.cer,
                bleu = EXCLUDED.bleu,
                updated_at = EXCLUDED.updated_at
        `, tableName)
        _, err = utils.DB.ExecContext(ctx, query,
            result.FileName, result.WER, result.CER, result.BLEU, result.Timestamp, result.Timestamp)
    }
    if err != nil {
        logger.Error("Database storage failed", zap.Error(err))
        return err
    }

    return nil
}
