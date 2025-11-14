# Medsum Text Analysis API

A microservice that subscribes to Valkey pub/sub notifications, retrieves transcripts from S3, and computes text analysis metrics including WER, CER, BLEU, and COMET scores.

## Overview

This service:

1. Subscribes to Valkey pub/sub channel `transcribe_complete`
2. Receives transcription completion notifications from medsum-api
3. Retrieves original and corrected transcripts from S3
4. Computes analysis metrics (WER, CER, BLEU, COMET)
5. Stores results in Valkey for retrieval

## Architecture

```
medsum-api (transcription completion)
    → Saves corrected transcript to S3
    → Publishes to Valkey channel "transcribe_complete"
        → transcript-analysis-api (subscriber)
            → Fetches transcripts from S3
            → Computes metrics
            → Stores results in Valkey
```

## Features

- **Valkey Pub/Sub Subscriber**: Listens for job completion events
- **S3 Integration**: Automatically discovers and downloads transcript files
- **S3 Retry Mechanism**: Automatically retries S3 downloads when files are not immediately available (configurable attempts and delay)
- **Metrics Computation**:
  - **WER (Word Error Rate)**: Measures word-level accuracy
  - **CER (Character Error Rate)**: Measures character-level accuracy
  - **BLEU Score**: Evaluates translation/transcription quality
  - **COMET Score**: Placeholder for neural-based quality estimation
- **REST API**: Query analysis results by job

## Prerequisites

- Go 1.24.2 or later
- Access to Valkey/Redis instance
- Access to S3-compatible storage
- Running medsum-api instance

## Installation

```bash
cd transcript-analysis-api
go mod download
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `APP_PORT` | HTTP server port | Yes | `8080` |
| `VALKEY_HOST` | Valkey host address | Yes | - |
| `VALKEY_PORT` | Valkey port | Yes | `6379` |
| `VALKEY_USE_SENTINEL` | Use Valkey Sentinel | No | `false` |
| `VALKEY_SENTINEL_ADDRESS` | Sentinel addresses (CSV) | No | - |
| `VALKEY_MASTER_NAME` | Sentinel master name | No | `valkeymaster` |
| `S3_ACCESS_KEY_ID` | AWS access key | Yes | - |
| `S3_SECRET_ACCESS_KEY` | AWS secret key | Yes | - |
| `S3_REGION` | AWS region | Yes | `us-east-1` |
| `S3_ENDPOINT_URL` | S3 endpoint | Yes | - |
| `S3_RETRY_MAX_ATTEMPTS` | Max S3 download retry attempts | No | `3` |
| `S3_RETRY_DELAY_SECONDS` | Delay between S3 retries (seconds) | No | `20` |
| `POSTGRES_HOST` | Postgres Host | Yes | - |
| `POSTGRES_PORT` | Postgres Port | No | 5432 |
| `POSTGRES_USER` | Postgres User | Yes | - |
| `POSTGRES_PASSWORD` | Postgres Password | Yes | - |
| `POSTGRES_DB` | Postgres Database | Yes | - |
| `POSTGRES_SSLMODE` | Postgresl SSL Mode | No | disable |

## Usage

### Running Locally

```bash
go run main.go
```

### Building

```bash
go build -o transcript-analysis-api
./transcript-analysis-api
```

### Docker

```bash
docker build -t transcript-analysis-api .
docker run -p 8080:8080 --env-file .env transcript-analysis-api
```

## API Endpoints

### GET /healthcheck

Health check endpoint

**Response:**

```json
{
  "message": "ok"
}
```

### GET /transcript-analysis/:job

Retrieve analysis results for a specific job

**Parameters:**

- `job`: The job identifier

**Response (Success):**

```json
{
  "wer": 0.15,
  "cer": 0.08,
  "bleu": 0.85,
  "comet": 0.92,
  "timestamp": "2025-10-08T10:30:00Z"
}
```

**Response (Not Found):**

```json
{
  "error": "Analysis not found",
  "message": "Analysis may still be processing or job is invalid"
}
```

**Response (Error):**

```json
{
  "error": "Analysis failed",
  "details": "{\"error\": \"...\", \"timestamp\": \"...\"}"
}
```

## S3 File Structure

Expected S3 structure for each job:

```
s3://bucket-name/
  └── {job}/
      ├── transcript.txt          # Original transcript
      └── transcript_corrected.txt # Corrected transcript
```

The service will automatically find files matching these patterns:

- Original: `*.txt` (excluding files with "_corrected")
- Corrected: `*_corrected.txt` or `*_corrected`

## Integration with medsum-api

To integrate with medsum-api, ensure that after the transcription API completes and the corrected transcript file is saved to S3, medsum-api publishes to the Valkey channel:

```javascript
// In medsum-api, after transcription completion and saving corrected file to S3:
await valkeyClient.publish('transcribe_complete', job);
```

## Metrics Explanation

### WER (Word Error Rate)

Measures the percentage of word-level errors (insertions, deletions, substitutions).

- Range: 0 (perfect) to 1+ (worse than random)
- Formula: `(S + D + I) / N` where N = total words in reference

### CER (Character Error Rate)

Measures the percentage of character-level errors.

- Range: 0 (perfect) to 1+ (worse than random)
- Formula: `(S + D + I) / N` where N = total characters in reference

### BLEU Score

Bilingual Evaluation Understudy score - measures n-gram precision with brevity penalty.

- Range: 0 (no match) to 1 (perfect match)
- Considers 1-gram through 4-gram matches

### COMET Score

Currently a placeholder using normalized edit distance similarity.

- Range: 0 (completely different) to 1 (identical)
- **Note**: Production implementation should use a proper COMET model

## Development

### Project Structure

```
transcript-analysis-api/
├── analyzer/           # Metrics computation logic
│   ├── analyzer.go    # Main analysis orchestration
│   └── metrics.go     # WER, CER, BLEU, COMET implementations
├── handlers/          # HTTP request handlers
│   └── analysis.go    # GET /transcript-analysis/:job

├── subscriber/        # Valkey pub/sub subscriber
│   └── subscriber.go  # Message handling and processing
├── utils/            # Utility functions
│   ├── env.go        # Environment variable helpers
│   └── s3.go         # S3 operations
├── valkey/           # Valkey client setup
│   └── client.go     # Valkey initialization
├── main.go           # Application entry point
├── Dockerfile        # Container image definition
└── README.md         # This file
```

### Adding New Metrics

To add a new metric:

1. Add computation function in `analyzer/metrics.go`
2. Update `AnalysisResult` struct in `analyzer/analyzer.go`
3. Call new metric in `AnalyzeTranscripts()`
4. Update result storage in `subscriber/subscriber.go`

## Troubleshooting

### Service not receiving pub/sub messages

- Verify Valkey connection settings
- Check that medsum-api is publishing to correct channel
- Ensure channel name matches in both services

### S3 files not found

- Verify S3 bucket name and credentials
- Check file naming convention matches expected pattern
- Ensure job matches the S3 prefix structure
- **Note**: The service automatically retries S3 downloads up to 3 times with a 20-second delay between attempts to handle eventual consistency issues. You can adjust this via `S3_RETRY_MAX_ATTEMPTS` and `S3_RETRY_DELAY_SECONDS` environment variables.

### High WER/CER scores

- Verify correct file ordering (reference vs hypothesis)
- Check text preprocessing (whitespace, punctuation)
- Ensure files contain actual transcript text
