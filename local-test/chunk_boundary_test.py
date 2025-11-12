import sys
import json
import io
import wave
import requests
import re

def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def split_wav_bytes(wav_path, chunk_sec, overlap_sec):
    out = []
    with wave.open(wav_path, "rb") as w:
        ch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        nf = w.getnframes()
        frames = w.readframes(nf)
        chunk_frames = int(chunk_sec * sr)
        stride = max(int((chunk_sec - overlap_sec) * sr), 1)
        for start in range(0, nf, stride):
            end = min(start + chunk_frames, nf)
            if start >= end:
                break
            start_b = start * ch * sw
            end_b = end * ch * sw
            buf = io.BytesIO()
            with wave.open(buf, "wb") as outw:
                outw.setnchannels(ch)
                outw.setsampwidth(sw)
                outw.setframerate(sr)
                outw.writeframes(frames[start_b:end_b])
            out.append(buf.getvalue())
    return out

def whisper_transcribe(base_url, language, wav_bytes):
    url = base_url.rstrip("/") + "/transcribe/"
    if language in ("se", "no"):
        url = base_url.rstrip("/") + f"/{language}/transcribe/"
    files = {"audio_file": ("chunk.wav", wav_bytes, "audio/wav")}
    r = requests.post(url, files=files)
    r.raise_for_status()
    data = r.json()
    return data.get("text", "")

def tokens(s):
    return re.findall(r"\w+", s.lower())

def is_cut(prev_last, next_first):
    if not prev_last or not next_first:
        return False
    if prev_last == next_first:
        return False
    return prev_last.startswith(next_first) or next_first.startswith(prev_last)

def levenshtein(a, b):
    la = len(a)
    lb = len(b)
    dp = [[0]*(lb+1) for _ in range(la+1)]
    for i in range(la+1):
        dp[i][0] = i
    for j in range(lb+1):
        dp[0][j] = j
    for i in range(1, la+1):
        ai = a[i-1]
        for j in range(1, lb+1):
            cost = 0 if ai == b[j-1] else 1
            dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost)
    return dp[la][lb]

def accuracy(gt, pred):
    gt_n = re.sub(r"\s+", " ", gt.lower().strip())
    pr_n = re.sub(r"\s+", " ", pred.lower().strip())
    if not gt_n and not pr_n:
        return 100.0
    m = max(len(gt_n), len(pr_n))
    d = levenshtein(gt_n, pr_n)
    return max(0.0, (m - d) * 100.0 / m)

def run(cfg_path):
    cfg = load_config(cfg_path)
    inp = cfg.get("input_path", "")
    chunk_sec = float(cfg.get("chunk_duration_sec", 15))
    overlap_sec = float(cfg.get("overlap_sec", 0))
    lang = cfg.get("language", "se")
    base = cfg.get("whisper_base_url", "https://medsum-gw.carasent.net/whisper")
    gt_path = cfg.get("ground_truth_path", "")
    gt = ""
    if gt_path:
        try:
            with open(gt_path, "r", encoding="utf-8") as f:
                gt = f.read()
        except Exception:
            gt = ""
    chunks = split_wav_bytes(inp, chunk_sec, overlap_sec)
    texts = []
    for b in chunks:
        try:
            t = whisper_transcribe(base, lang, b)
        except Exception:
            t = ""
        texts.append(t)
    cuts = []
    for i in range(len(texts)-1):
        left = tokens(texts[i])
        right = tokens(texts[i+1])
        pl = left[-1] if left else ""
        nf = right[0] if right else ""
        if is_cut(pl, nf):
            cuts.append({"boundary_index": i, "prev_last": pl, "next_first": nf})
    combined = " ".join([t for t in texts if t])
    acc = accuracy(gt, combined) if gt else None
    return {
        "input_path": inp,
        "chunk_duration_sec": chunk_sec,
        "overlap_sec": overlap_sec,
        "chunks": len(chunks),
        "cuts": cuts,
        "cut_boundaries": len(cuts),
        "accuracy": acc,
        "transcripts": texts
    }

def main():
    if len(sys.argv) < 2:
        print("usage: python local-test/chunk_boundary_test.py local-test/config.json")
        sys.exit(1)
    result = run(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
