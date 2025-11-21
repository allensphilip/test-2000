import argparse
import json
import os
import time
import nemo.collections.asr as nemo_asr
import torch

def transcribe(model, path):
    with torch.inference_mode():
        return model.transcribe([path], batch_size=1)

def extract_text(res):
    if isinstance(res, list) and len(res) > 0:
        r = res[0]
        return getattr(r, 'text', str(r))
    return str(res)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--lm', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--alpha_grid', default='0.6,0.8,1.0')
    parser.add_argument('--beta_grid', default='0.8,1.0,1.2')
    args = parser.parse_args()

    alpha_vals = [float(x) for x in args.alpha_grid.split(',')]
    beta_vals = [float(x) for x in args.beta_grid.split(',')]

    model = nemo_asr.models.ASRModel.restore_from(args.model)

    with open(args.dataset, 'r', encoding='utf-8') as f:
        items = json.load(f)

    scores = []
    for a in alpha_vals:
        for b in beta_vals:
            cfg = {
                'strategy': 'beam',
                'beam': {
                    'beam_size': 8,
                    'score_norm': True,
                    'return_best_hypothesis': True,
                    'preserve_alignments': False,
                    'max_symbols_per_step': 10,
                    'kenlm_path': args.lm,
                    'beam_alpha': a,
                    'beam_beta': b
                },
                'compute_hypothesis_token_set': False,
                'preserve_alignments': False
            }
            model.change_decoding_strategy(cfg)
            start = time.time()
            correct = 0
            total = 0
            for it in items:
                res = transcribe(model, it['audio'])
                hyp = extract_text(res).strip()
                ref = it['text'].strip()
                correct += int(hyp == ref)
                total += 1
            elapsed = time.time() - start
            acc = correct / max(1, total)
            scores.append({'alpha': a, 'beta': b, 'accuracy': acc, 'elapsed': elapsed})

    best = sorted(scores, key=lambda x: (-x['accuracy'], x['elapsed']))[0]
    print(json.dumps({'best': best, 'grid': scores}, ensure_ascii=False))

if __name__ == '__main__':
    main()