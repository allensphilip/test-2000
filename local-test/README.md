# Local Chunk Boundary Test

A compact, cross‑platform harness to understand and quantify audio chunking behavior: does fixed time slicing cut spoken words at boundaries, and how much does overlap or content‑aware segmentation help.

## Quick Start
- Install: `python -m pip install -r local-test/requirements.txt`
- UI server: `python -m local-test serve --port 5200` → open `http://127.0.0.1:5200/`
- CLI: `python -m local-test run --config local-test/config.json`

## What It Does
- Splits an input WAV into fixed‑duration chunks (with optional overlap).
- Transcribes each chunk.
- Detects suspected cut boundaries by comparing adjacent chunk edge tokens.
- Computes accuracy against ground truth and presents per‑chunk + combined transcripts.

## Modes
- Direct Whisper
  - Posts each chunk to `/{language}/transcribe/` with `audio_file`.
  - Use when you want pure chunk‑level transcription without server streaming logic.
- API Streaming
  - Mirrors stress‑test flow with `soundFile` + metadata and a final `flush`.
  - Target e.g. `http://localhost:8080/stream-chunk` (Chunk Service) or your proxy that supports chunk ingestion.

## Inputs
- Audio: WAV (PCM, mono 16 kHz recommended).
- Ground truth: upload a `.txt` file or paste text.
- Settings: chunk duration (sec), overlap (sec), language, optional API key, base URL or API streaming URL.

## Outputs
- UI shows: Chunks, Cut Boundaries, Accuracy, Per‑chunk transcripts, Combined transcript.
- JSON contains:
  - `chunks`: total chunk count
  - `cut_boundaries`: number of suspected mid‑word cuts
  - `cuts`: array of `{ boundary_index, prev_last, next_first }`
  - `transcripts`: per‑chunk texts
  - `combined`: final transcript (flush or joined)
  - `accuracy`: % vs ground truth (if provided)

## Interpreting Results
- Fewer `cut_boundaries` and higher `accuracy` indicate safer chunking.
- Try overlap (e.g., 0.5–1.0s) and compare results vs no overlap.
- For content‑aware segmentation, prefer server‑side EVS/SNS or silence‑based chunking where available.

## Tips
- Convert non‑WAV inputs: `ffmpeg -i input.webm -ar 16000 -ac 1 -c:a pcm_s16le output.wav`
- Direct Whisper mode expects an accessible Whisper Gateway; supply API key if required.
- API Streaming mode expects a chunk ingestion endpoint that returns per‑chunk or flush transcriptions.

## Files
- `local-test/index.html`: Minimal UI to upload, configure, and run.
- `local-test/server.py`: Implements `/run` (Direct Whisper) and `/run_stream` (API Streaming).
- `local-test/chunk_boundary_test.py`: CLI core; splits, transcribes, detects cuts, computes accuracy.
- `local-test/__main__.py`: Entry point for `python -m local-test` (serve or run).
- `local-test/config.json`: Example config for CLI runs.
- `local-test/requirements.txt`: Python deps.

## Why This Matters
Use this tool to validate whether your current chunking strategy introduces mid‑word truncation and to quickly test mitigations (overlap, different durations, or streaming ingestion that retains tails and re‑chunks).
