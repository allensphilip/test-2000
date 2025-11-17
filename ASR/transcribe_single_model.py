import os
import argparse
import csv
import tempfile
import torch
import librosa
import soundfile as sf
import nemo.collections.asr as nemo_asr
from omegaconf import DictConfig

def list_audio_files(samples_dir):
    exts = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.webm'}
    files = []
    for root, _, names in os.walk(samples_dir):
        for name in names:
            p = os.path.join(root, name)
            if os.path.isfile(p) and os.path.splitext(name)[1].lower() in exts:
                files.append(p)
    files = sorted(files)
    return files

def find_gt_in_dir(gt_dir, stem):
    p = os.path.join(gt_dir, f"{stem}.txt")
    if os.path.exists(p):
        try:
            with open(p, 'r', encoding='utf-8') as fh:
                return fh.read().strip()
        except Exception:
            return ''
    return ''

def convert_to_wav(input_path):
    audio, sr = librosa.load(input_path, sr=16000, mono=True)
    f = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    f.close()
    sf.write(f.name, audio, sr)
    return f.name

def extract_text(transcription):
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

def pick_first_model(model_dir):
    candidates = []
    for root, _, names in os.walk(model_dir):
        for n in names:
            if n.lower().endswith('.nemo') or n.lower().endswith('.ckpt'):
                candidates.append(os.path.join(root, n))
    candidates = sorted(candidates)
    if not candidates:
        raise FileNotFoundError('No model found')
    return candidates[0]

def set_decoding_strategy(model, strategy='greedy', beam_size=4, lm_path=None, alpha=0.5, beta=1.0):
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
    elif strategy == 'knelm_beam':
        cfg = DictConfig({
            'strategy': 'beam',
            'beam': {
                'beam_size': beam_size,
                'search_type': 'kenlm',
                'score_norm': True,
                'return_best_hypothesis': True,
                'softmax_temperature': 1.0,
                'preserve_alignments': False,
                'lm_path': lm_path,
                'lm_alpha': alpha,
                'lm_beta': beta,
                'use_knelm': True,
                'knelm_k': 10,
                'knelm_lambda': 0.1
            },
            'compute_hypothesis_token_set': False,
            'preserve_alignments': False
        })
    elif strategy == 'flashlight_beam':
        cfg = DictConfig({
            'strategy': 'beam',
            'beam': {
                'beam_size': beam_size,
                'search_type': 'flashlight',
                'flashlight_cfg': {
                    'lexicon_path': None,
                    'lm_path': lm_path,
                    'lm_weight': alpha,
                    'word_score': beta,
                    'unk_score': -float('inf'),
                    'sil_score': 0.0,
                    'log_add': False,
                    'criterion_type': 'ctc'
                },
                'return_best_hypothesis': True,
                'preserve_alignments': False
            },
            'compute_hypothesis_token_set': False,
            'preserve_alignments': False
        })
    elif strategy == 'maes':
        cfg = DictConfig({
            'strategy': 'maes',
            'maes': {
                'return_best_hypothesis': True
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
    model.change_decoding_strategy(cfg)

def run(samples_dir, model_dir, output_csv, gt_dir=None, strategy='greedy', beam_size=4, lm_path=None, alpha=0.5, beta=1.0):
    model_path = pick_first_model(model_dir)
    if model_path.endswith('.ckpt'):
        model = nemo_asr.models.ASRModel.load_from_checkpoint(model_path)
    else:
        model = nemo_asr.models.ASRModel.restore_from(model_path)
    model = model.half()
    set_decoding_strategy(model, strategy=strategy, beam_size=beam_size, lm_path=lm_path, alpha=alpha, beta=beta)
    audio_files = list_audio_files(samples_dir)
    headers = ['slno', 'sample', 'gt', 'transcript']
    rows = []
    slno = 1
    if gt_dir:
        os.makedirs(gt_dir, exist_ok=True)
    for ap in audio_files:
        stem = os.path.splitext(os.path.basename(ap))[0]
        gt = find_gt_in_dir(gt_dir if gt_dir else os.path.dirname(ap), stem)
        prep_path = ap
        if not ap.lower().endswith('.wav'):
            prep_path = convert_to_wav(ap)
        with torch.no_grad():
            result = model.transcribe([prep_path], batch_size=1)
        text = extract_text(result)
        if gt_dir:
            out_txt = os.path.join(gt_dir, f"{stem}.txt")
            try:
                with open(out_txt, 'w', encoding='utf-8') as fh:
                    fh.write(text)
            except Exception:
                pass
        rows.append([slno, stem, gt, text])
        slno += 1
        try:
            if prep_path != ap and os.path.exists(prep_path):
                os.remove(prep_path)
        except Exception:
            pass
    with open(output_csv, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(headers)
        for r in rows:
            w.writerow(r)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--samples-dir', type=str, default=os.path.join('test-data', 'audio'))
    parser.add_argument('--model-dir', type=str, required=True)
    parser.add_argument('--output', type=str, default='single_model_results.csv')
    parser.add_argument('--gt-dir', type=str, default=os.path.join('test-data', 'gt'))
    parser.add_argument('--strategy', type=str, default='greedy', choices=['greedy', 'beam', 'knelm_beam', 'flashlight_beam', 'maes'])
    parser.add_argument('--beam-size', type=int, default=4)
    parser.add_argument('--lm-path', type=str, default=None)
    parser.add_argument('--alpha', type=float, default=0.5)
    parser.add_argument('--beta', type=float, default=1.0)
    args = parser.parse_args()
    run(args.samples_dir, args.model_dir, args.output, args.gt_dir, args.strategy, args.beam_size, args.lm_path, args.alpha, args.beta)

if __name__ == '__main__':
    main()