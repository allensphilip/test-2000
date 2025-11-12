import os
import tempfile
from flask import Flask, request, jsonify, send_from_directory
import wave
import io
import requests
import re
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__, static_folder='.')

def split_wav_bytes_bytes(frames, ch, sw, sr, nf, chunk_sec, overlap_sec):
    out = []
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

def split_wav_file(path, chunk_sec, overlap_sec):
    with wave.open(path, "rb") as w:
        ch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        nf = w.getnframes()
        frames = w.readframes(nf)
    return split_wav_bytes_bytes(frames, ch, sw, sr, nf, chunk_sec, overlap_sec)

def whisper_transcribe(base_url, language, wav_bytes, api_key):
    url = base_url.rstrip("/") + "/transcribe/"
    if language in ("se", "no"):
        url = base_url.rstrip("/") + f"/{language}/transcribe/"
    files = {"audio_file": ("chunk.wav", wav_bytes, "audio/wav")}
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key
    r = requests.post(url, files=files, headers=headers)
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

def normalize(s):
    return re.sub(r"\s+", " ", s.lower().strip())

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/run', methods=['POST'])
def run_test():
    audio = request.files.get('audio')
    gt_text = request.form.get('groundTruthText', '')
    gt_file = request.files.get('groundTruthFile')
    chunk_sec = float(request.form.get('chunkDurationSec', '15'))
    overlap_sec = float(request.form.get('overlapSec', '0'))
    language = request.form.get('language', 'se')
    base_url = request.form.get('whisperBaseUrl', os.getenv('WHISPER_BASE_URL', 'https://medsum-gw.carasent.net/whisper'))
    api_key = request.form.get('apiKey', '') or os.getenv('API_KEY', '')
    if gt_file and gt_file.filename:
        try:
            gt_text = gt_file.read().decode('utf-8', errors='ignore')
        except Exception:
            gt_text = ''
    if not audio:
        return jsonify({"error": "audio required"}), 400
    tmpdir = tempfile.mkdtemp()
    audio_path = os.path.join(tmpdir, 'input.wav')
    audio.save(audio_path)
    chunks = split_wav_file(audio_path, chunk_sec, overlap_sec)
    texts = []
    for b in chunks:
        try:
            t = whisper_transcribe(base_url, language, b, api_key)
        except Exception:
            t = ''
        texts.append(t)
    cuts = []
    for i in range(len(texts)-1):
        left = tokens(texts[i])
        right = tokens(texts[i+1])
        pl = left[-1] if left else ''
        nf = right[0] if right else ''
        if is_cut(pl, nf):
            cuts.append({"boundary_index": i, "prev_last": pl, "next_first": nf})
    combined = " ".join([t for t in texts if t])
    acc = None
    if gt_text:
        gt_n = normalize(gt_text)
        pr_n = normalize(combined)
        m = max(len(gt_n), len(pr_n))
        d = levenshtein(gt_n, pr_n)
        acc = max(0.0, (m - d) * 100.0 / m) if m > 0 else 100.0
    return jsonify({
        "chunks": len(chunks),
        "cut_boundaries": len(cuts),
        "cuts": cuts,
        "accuracy": acc,
        "transcripts": texts,
        "combined": combined
    })

@app.route('/run_stream', methods=['POST'])
def run_stream():
    audio = request.files.get('audio')
    gt_text = request.form.get('groundTruthText', '')
    gt_file = request.files.get('groundTruthFile')
    chunk_sec = float(request.form.get('chunkDurationSec', '15'))
    overlap_sec = float(request.form.get('overlapSec', '0'))
    language = request.form.get('language', 'se')
    api_url = request.form.get('apiUrl', '') or os.getenv('API_STREAM_URL', '')
    api_key = request.form.get('apiKey', '') or os.getenv('API_KEY', '')
    application = request.form.get('application', 'local-test')
    journal = request.form.get('journal', 'local-1')
    translate = request.form.get('translate', 'false').lower() == 'true'
    timestamps = request.form.get('timestamps', 'false').lower() == 'true'
    if gt_file and gt_file.filename:
        try:
            gt_text = gt_file.read().decode('utf-8', errors='ignore')
        except Exception:
            gt_text = ''
    if not audio or not api_url:
        return jsonify({"error": "audio and apiUrl required"}), 400
    tmpdir = tempfile.mkdtemp()
    audio_path = os.path.join(tmpdir, 'input.wav')
    audio.save(audio_path)
    chunks = split_wav_file(audio_path, chunk_sec, overlap_sec)
    import time, random
    job_id = f"local-{int(time.time()*1000)}-{random.randint(1000,9999)}"
    headers = {}
    if api_key:
        headers['X-API-Key'] = api_key
    texts = []
    for b in chunks:
        files = {'soundFile': ('chunk.wav', b, 'audio/wav')}
        data = {
            'application': application,
            'journal': journal,
            'jobId': job_id,
            'language': language,
            'translate': str(translate).lower(),
            'timestamps': str(timestamps).lower(),
            'flush': 'false'
        }
        try:
            r = requests.post(api_url, files=files, data=data, headers=headers, timeout=120)
            t = ''
            if r.ok:
                try:
                    js = r.json()
                    t = js.get('transcription', '') or ''
                except Exception:
                    t = ''
        except Exception:
            t = ''
        texts.append(t)
    flush_blob = io.BytesIO()
    with wave.open(flush_blob, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00" * 16000 * 2)
    files = {'soundFile': ('flush.wav', flush_blob.getvalue(), 'audio/wav')}
    data = {
        'application': application,
        'journal': journal,
        'jobId': job_id,
        'language': language,
        'translate': str(translate).lower(),
        'timestamps': str(timestamps).lower(),
        'flush': 'true'
    }
    final_text = ''
    try:
        r = requests.post(api_url, files=files, data=data, headers=headers, timeout=120)
        if r.ok:
            try:
                js = r.json()
                final_text = js.get('transcription', '') or ''
            except Exception:
                final_text = ''
    except Exception:
        final_text = ''
    combined = final_text or " ".join([t for t in texts if t])
    cuts = []
    for i in range(len(texts)-1):
        left = tokens(texts[i])
        right = tokens(texts[i+1])
        pl = left[-1] if left else ''
        nf = right[0] if right else ''
        if is_cut(pl, nf):
            cuts.append({"boundary_index": i, "prev_last": pl, "next_first": nf})
    acc = None
    if gt_text:
        gt_n = normalize(gt_text)
        pr_n = normalize(combined)
        m = max(len(gt_n), len(pr_n))
        d = levenshtein(gt_n, pr_n)
        acc = max(0.0, (m - d) * 100.0 / m) if m > 0 else 100.0
    return jsonify({
        "chunks": len(chunks),
        "cut_boundaries": len(cuts),
        "cuts": cuts,
        "accuracy": acc,
        "transcripts": texts,
        "combined": combined,
        "jobId": job_id
    })

@app.route('/create_api_key', methods=['POST'])
def create_api_key():
    medsum_api = request.form.get('medsumApiUrl', '') or os.getenv('MEDSUM_API_INTERNAL_URL', 'http://localhost:3000')
    admin_key = request.form.get('adminApiKey', '') or os.getenv('ADMIN_API_KEY', '')
    client_name = request.form.get('clientName', '')
    if not client_name:
        return jsonify({"error": "clientName required"}), 400
    headers = {"X-API-Key": admin_key, "Content-Type": "application/json"} if admin_key else {"Content-Type": "application/json"}
    try:
        r = requests.post(f"{medsum_api}/internal/auth/client", headers=headers, json={"name": client_name}, timeout=30)
        if not r.ok:
            return jsonify({"error": r.text}), r.status_code
        js = r.json()
        return jsonify(js)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', '5200'))
    print(f"http://localhost:{port}/")
    app.run(host=host, port=port)
