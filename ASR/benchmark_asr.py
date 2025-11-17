import os
import argparse
import csv
import tempfile
import time
import torch
import librosa
import soundfile as sf
import nemo.collections.asr as nemo_asr
from omegaconf import DictConfig

class ASRWrapper:
    def __init__(self, model_path, strategy='greedy', beam_size=4):
        self.model_path = model_path
        self.strategy = strategy
        self.beam_size = beam_size
        self.model = None
        self.initialized = False
        self.initialize()

    def initialize(self):
        if self.model_path.endswith('.ckpt'):
            self.model = nemo_asr.models.ASRModel.load_from_checkpoint(self.model_path)
        else:
            self.model = nemo_asr.models.ASRModel.restore_from(self.model_path)
        self.model = self.model.half()
        self.set_decoding(self.strategy, self.beam_size)
        self.initialized = True

    def set_decoding(self, strategy='greedy', beam_size=4):
        if strategy == 'greedy':
            cfg = DictConfig({
                'strategy': 'greedy',
                'greedy': {
                    'max_symbols_per_step': 10,
                    'preserve_alignments': False,
                    'preserve_frame_confidence': False,
                    'loop_labels': True,
                    'use_cuda_graph_decoder': True
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        elif strategy == 'beam':
            cfg = DictConfig({
                'strategy': 'beam',
                'beam': {
                    'beam_size': beam_size,
                    'search_type': 'default',
                    'score_norm': True,
                    'return_best_hypothesis': True,
                    'softmax_temperature': 1.0,
                    'preserve_alignments': False
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        else:
            cfg = DictConfig({
                'strategy': 'greedy',
                'greedy': {
                    'max_symbols_per_step': 10,
                    'preserve_alignments': False,
                    'preserve_frame_confidence': False,
                    'loop_labels': True,
                    'use_cuda_graph_decoder': True
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            })
        self.model.change_decoding_strategy(cfg)

    def _extract_text(self, transcription):
        try:
            if isinstance(transcription, list):
                if len(transcription) > 0:
                    result = transcription[0]
                    if hasattr(result, 'item'):
                        return str(result.item())
                    elif hasattr(result, 'text'):
                        return str(result.text)
                    else:
                        return str(result)
                else:
                    return ''
            elif isinstance(transcription, torch.Tensor):
                return str(transcription.item()) if transcription.numel() == 1 else str(transcription.tolist())
            elif hasattr(transcription, 'text'):
                return str(transcription.text)
            else:
                return str(transcription)
        except Exception:
            return str(transcription)

    def transcribe(self, audio_path):
        with torch.no_grad():
            result = self.model.transcribe([audio_path], batch_size=1)
        return self._extract_text(result)

def convert_to_wav(input_path):
    audio, sr = librosa.load(input_path, sr=16000, mono=True)
    f = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    f.close()
    sf.write(f.name, audio, sr)
    return f.name

def trim_to_30s(input_path):
    audio, sr = librosa.load(input_path, sr=16000, mono=True, offset=0.0, duration=30.0)
    f = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    f.close()
    sf.write(f.name, audio, sr)
    return f.name

def find_gt(samples_dir, stem):
    candidates = [
        os.path.join(samples_dir, f"{stem}_gt.txt"),
        os.path.join(samples_dir, f"{stem}_transcript.txt"),
        os.path.join(samples_dir, f"{stem}.txt"),
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as fh:
                    return fh.read().strip()
            except Exception:
                return ''
    return ''

def list_audio_files(samples_dir):
    exts = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.webm'}
    files = []
    for name in sorted(os.listdir(samples_dir)):
        p = os.path.join(samples_dir, name)
        if os.path.isfile(p) and os.path.splitext(name)[1].lower() in exts:
            files.append(p)
    return files

def list_model_files(model_dirs):
    paths = []
    for d in model_dirs:
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for name in files:
                if name.lower().endswith('.nemo') or name.lower().endswith('.ckpt'):
                    paths.append(os.path.join(root, name))
    # stable order
    paths = sorted(paths)
    return paths

def run_benchmark(samples_dir, model_dirs, output_csv, strategy, beam_size):
    audio_files = list_audio_files(samples_dir)
    model_paths = list_model_files(model_dirs)
    models = []
    for mp in model_paths:
        try:
            m = ASRWrapper(mp, strategy=strategy, beam_size=beam_size)
            models.append(m)
        except Exception:
            models.append(None)
    headers = ['slno', 'sample', 'gt'] + [os.path.splitext(os.path.basename(p))[0] for p in model_paths]
    rows = []
    slno = 1
    for ap in audio_files:
        stem = os.path.splitext(os.path.basename(ap))[0]
        gt = find_gt(samples_dir, stem)
        prep_path = ap
        if not ap.lower().endswith('.wav'):
            prep_path = convert_to_wav(ap)
        thirty_path = trim_to_30s(prep_path)
        texts = []
        for m in models:
            if m is None:
                texts.append('')
                continue
            try:
                t0 = time.time()
                txt = m.transcribe(thirty_path)
                _ = time.time() - t0
                texts.append(txt)
            except Exception:
                texts.append('')
        rows.append([slno, stem, gt] + texts)
        slno += 1
        try:
            if prep_path != ap and os.path.exists(prep_path):
                os.remove(prep_path)
            if os.path.exists(thirty_path):
                os.remove(thirty_path)
        except Exception:
            pass
    with open(output_csv, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(headers)
        for r in rows:
            w.writerow(r)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples-dir', type=str, default=os.path.join(os.getcwd(), 'test-data'))
    parser.add_argument('--model-dirs', nargs='+', type=str, required=True)
    parser.add_argument('--output', type=str, default=os.path.join(os.getcwd(), 'benchmark_results.csv'))
    parser.add_argument('--strategy', type=str, default='greedy', choices=['greedy', 'beam'])
    parser.add_argument('--beam-size', type=int, default=4)
    args = parser.parse_args()
    run_benchmark(args.samples_dir, args.model_dirs, args.output, args.strategy, args.beam_size)

if __name__ == '__main__':
    main()
