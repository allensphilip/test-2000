import os
import math
import argparse
import librosa
import numpy as np
import soundfile as sf

def ensure_dir(p):
    if not os.path.exists(p):
        os.makedirs(p, exist_ok=True)

def slice_wav(input_path, output_dir, chunk_seconds=30, target_sr=16000, prefix='sample', start_index=1):
    ensure_dir(output_dir)
    audio, sr = librosa.load(input_path, sr=target_sr, mono=True)
    samples_per_chunk = int(chunk_seconds * target_sr)
    total_samples = len(audio)
    if total_samples == 0:
        num_chunks = 1
    else:
        num_chunks = math.ceil(total_samples / samples_per_chunk)
    for i in range(num_chunks):
        start = i * samples_per_chunk
        end = start + samples_per_chunk
        chunk = audio[start:end]
        if len(chunk) < samples_per_chunk:
            pad = np.zeros(samples_per_chunk - len(chunk), dtype=np.float32)
            if len(chunk) == 0:
                chunk = pad
            else:
                chunk = np.concatenate([chunk.astype(np.float32), pad])
        else:
            chunk = chunk.astype(np.float32)
        idx = start_index + i
        name = f"{prefix}_{idx:03d}.wav"
        out_path = os.path.join(output_dir, name)
        sf.write(out_path, chunk, target_sr)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=str, default='d:\\SOLAI\\CARASSENT\\ASR\\test-data\\base\\sample_1.wav')
    parser.add_argument('--output-dir', type=str, default='d:\\SOLAI\\CARASSENT\\ASR\\test-data')
    parser.add_argument('--chunk-seconds', type=int, default=30)
    parser.add_argument('--sr', type=int, default=16000)
    parser.add_argument('--prefix', type=str, default='sample')
    parser.add_argument('--start-index', type=int, default=1)
    args = parser.parse_args()
    slice_wav(args.input, args.output_dir, args.chunk_seconds, args.sr, args.prefix, args.start_index)

if __name__ == '__main__':
    main()
