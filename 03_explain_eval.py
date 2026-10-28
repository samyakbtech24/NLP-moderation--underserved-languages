# =============================================================================
# FairMod — Notebook 3: Explainability Benchmark (P3)
# =============================================================================
# PURPOSE : Step 7  → Integrated Gradients vs LIME benchmark (Experiment C)
#           Step 7  → MANDATORY word-boundary check (master §5.5)
#           Step 12 → Export Kannada misclassifications + highlights for the
#                     native speaker's error analysis
#           Step 10 → Push the MuRIL checkpoint to the HF Hub for the Space
#
# INPUTS  : checkpoints/muril_pooled/final   (from 02_train.py Cell 10)
#           processed/test.csv               (FROZEN — read only)
#           code/fairmod_explain.py          (upload once, see Cell 3)
# OUTPUTS : results/word_boundary_check.csv  → native speaker fills last column
#           results/explainer_benchmark.json → Experiment C table
#           results/explainer_benchmark.csv
#           results/explainer_items.csv      → per-item scores (for appendix)
#           results/muril_test_predictions.csv
#           results/error_analysis_kn.csv    → Step 12 input
#
# DECISION LOG (Step 7 — locked before running):
#   - IG    : Captum LayerIntegratedGradients, embedding layer, n_steps=32
#             (master §5.4), raw Captum — transformers-interpret NOT used
#   - LIME  : num_samples=500, words split on whitespace (same words as IG),
#             removed words are deleted (mask_string=''), bow=False
#   - SAMPLE: 152 test items, 19 per language × label, seed 42
#   - Both explainers explain the PREDICTED class
#   - AGREEMENT     : |IG top-5 ∩ LIME top-5| / min(5, #words)
#   - k for faithfulness = top 20% of words (at least 1), ERASER-style
#   - COMPREHENSIVENESS : p(pred | x) − p(pred | x without top-k)  (higher = better)
#   - SUFFICIENCY       : p(pred | x) − p(pred | only top-k)       (lower  = better)
#     Both are also reported for k RANDOM words, so the numbers have a reference.
#   - LATENCY: GPU on all 152 items; CPU on a 20-item subset (Colab CPU = 2 vCPU,
#     same class of hardware as HF Spaces CPU Basic)
#
# HOW TO RUN IN GOOGLE COLAB:
#   1. Runtime → Change runtime type → T4 GPU
#   2. Each block between "# CELL X" comments = one Colab cell, run IN ORDER
#   3. Paste the full printed output back after each cell
#
# ESTIMATED TIME: ~25 min (LIME on CPU is the slow part)
# =============================================================================


# ─── CELL 1 : Install dependencies ─────────────────────────────────────────

get_ipython().system('pip install -q transformers captum lime scikit-learn pandas')


# ─── CELL 2 : Imports and reproducibility seed ──────────────────────────────

import os
import sys
import json
import math
import time
import random
import numpy as np
import pandas as pd
import torch
from sklearn.metrics import f1_score

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

LANGS = ['hi', 'kn', 'mr', 'bn']
LANG_NAMES = {'hi': 'Hindi', 'kn': 'Kannada', 'mr': 'Marathi', 'bn': 'Bengali'}
print("Imports done. Seed =", SEED)


# ─── CELL 3 : Mount Drive, load the shared explainer module ─────────────────
# ONE-TIME SETUP: upload fairmod_explain.py from the repo into
#   MyDrive/fairmod/code/
# The app imports the same file, so the benchmark measures the demo's code.

from google.colab import drive
drive.mount('/content/drive')

BASE  = '/content/drive/MyDrive/fairmod'
PROC  = os.path.join(BASE, 'processed')
RES   = os.path.join(BASE, 'results')
CKPT  = os.path.join(BASE, 'checkpoints')
CODE  = os.path.join(BASE, 'code')
MODEL = os.path.join(CKPT, 'muril_pooled', 'final')

assert os.path.exists(os.path.join(CODE, 'fairmod_explain.py')), \
    f"Upload fairmod_explain.py to {CODE} first."
assert os.path.exists(MODEL), f"No checkpoint at {MODEL} — run 02_train.py Cell 10 first."
sys.path.insert(0, CODE)

from fairmod_explain import FairModExplainer, IG_N_STEPS
print("Explainer module loaded. IG n_steps =", IG_N_STEPS)


# ─── CELL 4 : Load the model and check it matches Notebook 2 ────────────────
# Re-scores the full frozen test set. Overall macro-F1 must equal the number in
# muril_results.json — if it doesn't, the wrong checkpoint was loaded.

E = FairModExplainer(MODEL, device='cuda' if torch.cuda.is_available() else 'cpu')
print("Device:", E.device, "| labels:", E.labels)

test_df = pd.read_csv(os.path.join(PROC, 'test.csv'))
test_df['text'] = test_df['text'].astype(str)

probs = E.predict_proba(test_df['text'].tolist(), batch_size=128)
test_df['pred'] = probs.argmax(axis=1)
test_df['p_abusive'] = probs[:, 1]

overall = f1_score(test_df['label'], test_df['pred'], average='macro')
print(f"Test macro-F1 (overall): {overall:.4f}")
with open(os.path.join(RES, 'muril_results.json'), encoding='utf-8') as f:
    expected = json.load(f)['overall']
print(f"Notebook 2 reported   : {expected:.4f}")
assert abs(overall - expected) < 0.005, "MISMATCH — wrong checkpoint? Stop and investigate."

test_df.to_csv(os.path.join(RES, 'muril_test_predictions.csv'), index=False)
print("Saved muril_test_predictions.csv")


# ─── CELL 5 : MANDATORY WORD-BOUNDARY CHECK (master §5.5) ───────────────────
# 10 test comments predicted abusive, in native scripts. For each word we print
# the subword tokens MuRIL produced and the IG score. Check that:
#   (a) every word is a WHOLE word — not split at a vowel sign (matra)
#   (b) the tokens listed for a word really belong to that word
# The native Kannada speaker must verify at least the 3 Kannada (kn/macd) items,
# then fill the native_speaker_ok column in results/word_boundary_check.csv.

def strip_wp(tok):
    return tok[2:] if tok.startswith('##') else tok

def no_zw(s):
    # The tokenizer drops zero-width (non-)joiners U+200C / U+200D, common in Bengali
    return s.replace('‌', '').replace('‍', '')

picks = [('kn', 'macd', 3), ('kn', 'dravidian_kn', 1), ('hi', 'macd', 2),
         ('mr', 'mahahate', 2), ('bn', 'bengali_hs', 2)]
rows, mismatches = [], 0
for lang, src, n in picks:
    pool = test_df[(test_df.language == lang) & (test_df.source == src)
                   & test_df.text.str.split().str.len().between(4, 15)]
    # Prefer comments predicted abusive; top up with others if there are too few
    chosen = pool[pool.pred == 1].sample(min(n, (pool.pred == 1).sum()), random_state=SEED)
    chosen = pd.concat([chosen, pool[pool.pred == 0].sample(n - len(chosen), random_state=SEED)])
    for _, r in chosen.iterrows():
        ex = E.explain(r['text'])
        print("=" * 70)
        print(f"[{lang}/{src}] gold={r['label']} p_abusive={ex['probs'][1]:.3f}")
        print(r['text'])
        print("-" * 70)
        for w, toks, s in zip(ex['words'], ex['tokens'], ex['scores']):
            rebuilt = ''.join(strip_wp(t) for t in toks)
            ok = rebuilt == no_zw(w) or '[UNK]' in toks
            mismatches += (not ok)
            flag = '' if ok else '   <-- tokens do not rebuild the word'
            print(f"  {w:<20} {s if s is None else round(s, 4)!s:>9}   {' '.join(toks)}{flag}")
            rows.append({'language': lang, 'source': src, 'text': r['text'], 'word': w,
                         'tokens': ' '.join(toks), 'ig_score': s, 'auto_rebuild_ok': ok,
                         'native_speaker_ok': ''})

pd.DataFrame(rows).to_csv(os.path.join(RES, 'word_boundary_check.csv'), index=False)
print(f"\nAutomatic check: {mismatches} word(s) whose tokens don't rebuild the word "
      "(expected 0). [UNK] is normal for emoji — MuRIL has no emoji in its vocabulary.")
print("Saved word_boundary_check.csv — native speaker: fill native_speaker_ok (Y/N).")


# ─── CELL 6 : Benchmark sample — 152 held-out items ─────────────────────────
# 19 per language × gold label, from the frozen test set, seed 42.

bench = (test_df.groupby(['language', 'label'], group_keys=False)
                .sample(19, random_state=SEED)
                .reset_index(drop=True))
print(f"Benchmark sample: {len(bench)} items")
print(bench.groupby(['language', 'label']).size().unstack().to_string())


# ─── CELL 7 : Integrated Gradients on GPU ───────────────────────────────────

for t in bench['text'].head(3):      # warm-up: CUDA kernels, tokenizer caches
    E.explain(t)
if E.device == 'cuda':
    torch.cuda.synchronize()

ig = []
for t in bench['text']:
    ig.append(E.explain(t))
    if E.device == 'cuda':
        torch.cuda.synchronize()
ig_gpu_ms = [x['latency_ms'] for x in ig]
print(f"IG ({E.device}): mean {np.mean(ig_gpu_ms):.1f} ms | median {np.median(ig_gpu_ms):.1f} ms "
      f"| p95 {np.percentile(ig_gpu_ms, 95):.1f} ms per comment")


# ─── CELL 8 : LIME on GPU (num_samples=500) ─────────────────────────────────
# Same words as IG: split on whitespace, bow=False (each position is its own
# feature), removed words are deleted rather than replaced by a placeholder.

from lime.lime_text import LimeTextExplainer

LIME_SAMPLES = 500
lime_explainer = LimeTextExplainer(class_names=E.labels, split_expression=r'\s+',
                                   bow=False, mask_string='', random_state=SEED)

def lime_explain(explainer_obj, text, target):
    t0 = time.perf_counter()
    words = text.split()
    exp = lime_explainer.explain_instance(
        text, lambda xs: explainer_obj.predict_proba(list(xs), batch_size=128),
        labels=(target,), num_features=len(words), num_samples=LIME_SAMPLES)
    weights = dict(exp.as_map()[target])
    return [weights.get(i, 0.0) for i in range(len(words))], (time.perf_counter() - t0) * 1000

lime_scores, lime_gpu_ms = [], []
for t, x in zip(bench['text'], ig):
    s, ms = lime_explain(E, t, x['pred'])
    lime_scores.append(s)
    lime_gpu_ms.append(ms)
print(f"LIME ({E.device}): mean {np.mean(lime_gpu_ms):.0f} ms | median {np.median(lime_gpu_ms):.0f} ms "
      f"| p95 {np.percentile(lime_gpu_ms, 95):.0f} ms per comment")


# ─── CELL 9 : Agreement, comprehensiveness, sufficiency ─────────────────────
# Words cut off by the 128-token truncation (IG score None) are excluded from
# ranking for BOTH explainers.

TOP_AGREE = 5
K_FRAC    = 0.2
rng = np.random.default_rng(SEED)

def top_idx(scores, k, valid):
    order = sorted(valid, key=lambda i: scores[i], reverse=True)
    return order[:k]

items, perturbed = [], []
for row, x, ls in zip(bench.itertuples(), ig, lime_scores):
    words = x['words']
    valid = [i for i, s in enumerate(x['scores']) if s is not None]
    ig_s  = [s if s is not None else 0.0 for s in x['scores']]
    k_ag  = min(TOP_AGREE, len(valid))
    agree = len(set(top_idx(ig_s, k_ag, valid)) & set(top_idx(ls, k_ag, valid))) / k_ag

    k = max(1, round(K_FRAC * len(valid)))
    sets = {'ig': top_idx(ig_s, k, valid), 'lime': top_idx(ls, k, valid),
            'random': list(rng.choice(valid, size=k, replace=False))}
    item = {'language': row.language, 'source': row.source, 'label': row.label,
            'pred': x['pred'], 'n_words': len(words), 'k': k,
            'p_pred': x['probs'][x['pred']], 'agreement_top5': agree,
            'ig_ms_gpu': x['latency_ms']}
    for name, idx in sets.items():
        drop = set(idx)
        perturbed.append((len(items), f'{name}_without', ' '.join(w for i, w in enumerate(words) if i not in drop)))
        perturbed.append((len(items), f'{name}_only',    ' '.join(w for i, w in enumerate(words) if i in drop)))
    items.append(item)

p = E.predict_proba([t for _, _, t in perturbed], batch_size=128)
for (i, key, _), pr in zip(perturbed, p):
    items[i][f'p_{key}'] = float(pr[items[i]['pred']])

items_df = pd.DataFrame(items)
for name in ['ig', 'lime', 'random']:
    items_df[f'{name}_comprehensiveness'] = items_df['p_pred'] - items_df[f'p_{name}_without']
    items_df[f'{name}_sufficiency']       = items_df['p_pred'] - items_df[f'p_{name}_only']
items_df['lime_ms_gpu'] = lime_gpu_ms

print(f"IG–LIME top-5 agreement : {items_df['agreement_top5'].mean():.3f} "
      f"(items with ≥10 words: {items_df.loc[items_df.n_words >= 10, 'agreement_top5'].mean():.3f}, "
      f"n={int((items_df.n_words >= 10).sum())})")
print(f"\n{'':<8} {'comprehensiveness ↑':>20} {'sufficiency ↓':>15}")
for name in ['ig', 'lime', 'random']:
    print(f"{name:<8} {items_df[f'{name}_comprehensiveness'].mean():>20.3f} "
          f"{items_df[f'{name}_sufficiency'].mean():>15.3f}")
print("\nPer language — agreement / IG comprehensiveness:")
print(items_df.groupby('language')[['agreement_top5', 'ig_comprehensiveness']].mean().round(3).to_string())


# ─── CELL 10 : CPU latency — the realistic NGO / HF Spaces scenario ─────────
# 20-item subset (LIME on CPU takes several seconds per comment).

N_CPU = 20
E_cpu = FairModExplainer(MODEL, device='cpu')
cpu_texts = bench.groupby('language', group_keys=False).head(N_CPU // len(LANGS))['text'].tolist()
for t in cpu_texts[:2]:
    E_cpu.explain(t)    # warm-up

pred_cpu_ms, ig_cpu_ms, lime_cpu_ms = [], [], []
for t in cpu_texts:
    t0 = time.perf_counter(); E_cpu.predict_proba([t]); pred_cpu_ms.append((time.perf_counter() - t0) * 1000)
    x = E_cpu.explain(t); ig_cpu_ms.append(x['latency_ms'])
    lime_cpu_ms.append(lime_explain(E_cpu, t, x['pred'])[1])

pred_gpu_ms = []
for t in cpu_texts:
    t0 = time.perf_counter(); E.predict_proba([t]); pred_gpu_ms.append((time.perf_counter() - t0) * 1000)

print(f"CPU threads: {torch.get_num_threads()}")
print(f"Prediction only : CPU {np.mean(pred_cpu_ms):.0f} ms")
print(f"IG              : CPU {np.mean(ig_cpu_ms):.0f} ms")
print(f"LIME            : CPU {np.mean(lime_cpu_ms):.0f} ms")
del E_cpu


# ─── CELL 11 : Save the Experiment C table ──────────────────────────────────

gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none'
def lat(xs):
    return {'mean_ms': round(float(np.mean(xs)), 1), 'median_ms': round(float(np.median(xs)), 1),
            'p95_ms': round(float(np.percentile(xs, 95)), 1), 'n': len(xs)}

summary = {
    'hardware': {'gpu': gpu_name, 'cpu_threads': torch.get_num_threads()},
    'config': {'ig_n_steps': IG_N_STEPS, 'lime_num_samples': LIME_SAMPLES,
               'k_fraction': K_FRAC, 'agreement_top_k': TOP_AGREE, 'seed': SEED},
    'n_items': len(items_df),
    'latency': {
        'prediction_only': {'gpu': lat(pred_gpu_ms), 'cpu': lat(pred_cpu_ms)},
        'integrated_gradients': {'gpu': lat(ig_gpu_ms), 'cpu': lat(ig_cpu_ms)},
        'lime': {'gpu': lat(lime_gpu_ms), 'cpu': lat(lime_cpu_ms)},
    },
    'agreement_top5': {'all': round(items_df['agreement_top5'].mean(), 3),
                       'min_10_words': round(items_df.loc[items_df.n_words >= 10, 'agreement_top5'].mean(), 3),
                       'per_language': items_df.groupby('language')['agreement_top5'].mean().round(3).to_dict()},
    'faithfulness': {name: {'comprehensiveness': round(items_df[f'{name}_comprehensiveness'].mean(), 3),
                            'sufficiency': round(items_df[f'{name}_sufficiency'].mean(), 3)}
                     for name in ['ig', 'lime', 'random']},
}
with open(os.path.join(RES, 'explainer_benchmark.json'), 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2)
items_df.to_csv(os.path.join(RES, 'explainer_items.csv'), index=False)

table = pd.DataFrame({
    'Method': ['Integrated Gradients', 'LIME', 'Random words'],
    'GPU ms': [summary['latency']['integrated_gradients']['gpu']['mean_ms'],
               summary['latency']['lime']['gpu']['mean_ms'], None],
    'CPU ms': [summary['latency']['integrated_gradients']['cpu']['mean_ms'],
               summary['latency']['lime']['cpu']['mean_ms'], None],
    'Comprehensiveness ↑': [summary['faithfulness'][m]['comprehensiveness'] for m in ['ig', 'lime', 'random']],
    'Sufficiency ↓': [summary['faithfulness'][m]['sufficiency'] for m in ['ig', 'lime', 'random']],
})
table.to_csv(os.path.join(RES, 'explainer_benchmark.csv'), index=False)
print(table.to_string(index=False))
print(f"\nIG–LIME top-5 agreement: {summary['agreement_top5']['all']}")
print(f"IG speed-up over LIME on CPU: {np.mean(lime_cpu_ms) / np.mean(ig_cpu_ms):.1f}x")
print("Saved explainer_benchmark.json / .csv and explainer_items.csv → P4.")


# ─── CELL 12 : Step 12 input — Kannada misclassifications with highlights ───
# 20 wrong Kannada predictions (10 false positives, 10 false negatives where
# available) with the top-3 IG words. The native speaker writes WHY in the
# last column. Content may be distressing — rotate who reads it.

kn_wrong = test_df[(test_df.language == 'kn') & (test_df.pred != test_df.label)]
err = pd.concat([kn_wrong[kn_wrong.pred == 1].sample(min(10, (kn_wrong.pred == 1).sum()), random_state=SEED),
                 kn_wrong[kn_wrong.pred == 0].sample(min(10, (kn_wrong.pred == 0).sum()), random_state=SEED)])
rows = []
for _, r in err.iterrows():
    x = E.explain(r['text'])
    ranked = sorted([(s, w) for w, s in zip(x['words'], x['scores']) if s is not None], reverse=True)
    rows.append({'source': r['source'], 'text': r['text'], 'gold': r['label'], 'pred': r['pred'],
                 'p_abusive': round(r['p_abusive'], 3),
                 'top3_ig_words': ' | '.join(w for _, w in ranked[:3]),
                 'error_type': 'false positive' if r['pred'] == 1 else 'false negative',
                 'native_speaker_reason': ''})
pd.DataFrame(rows).to_csv(os.path.join(RES, 'error_analysis_kn.csv'), index=False)
print(f"Kannada test errors: {len(kn_wrong):,} — exported {len(rows)} to error_analysis_kn.csv")


# ─── CELL 13 : Push the model to the HuggingFace Hub (for the Space) ────────
# The Space downloads the model from here at startup. Creates a PRIVATE model
# repo; give the Space access by adding your token as a Space secret HF_TOKEN.
# Use a token with WRITE permission (huggingface.co/settings/tokens).

from huggingface_hub import login, HfApi
login()                                     # paste your HF write token

HF_MODEL_REPO = 'YOUR_HF_USERNAME/fairmod-muril'    # ← edit before running
assert not HF_MODEL_REPO.startswith('YOUR_'), "Set HF_MODEL_REPO first."
api = HfApi()
api.create_repo(HF_MODEL_REPO, private=True, exist_ok=True)
api.upload_folder(folder_path=MODEL, repo_id=HF_MODEL_REPO,
                  commit_message='FairMod MuRIL pooled checkpoint (02_train.py Cell 10)')
print(f"Uploaded → https://huggingface.co/{HF_MODEL_REPO}")
print(f"Set MODEL_ID={HF_MODEL_REPO} as a Space variable (see README, Step 10).")


# ─── CELL 14 : Final summary for the team ───────────────────────────────────

print("=" * 60)
print("NOTEBOOK 3 — COMPLETE SUMMARY")
print("=" * 60)
print(f"  IG   latency  GPU {summary['latency']['integrated_gradients']['gpu']['mean_ms']} ms | "
      f"CPU {summary['latency']['integrated_gradients']['cpu']['mean_ms']} ms")
print(f"  LIME latency  GPU {summary['latency']['lime']['gpu']['mean_ms']} ms | "
      f"CPU {summary['latency']['lime']['cpu']['mean_ms']} ms")
print(f"  IG–LIME top-5 agreement : {summary['agreement_top5']['all']}")
for m in ['ig', 'lime', 'random']:
    print(f"  {m:<6} comprehensiveness {summary['faithfulness'][m]['comprehensiveness']:.3f} | "
          f"sufficiency {summary['faithfulness'][m]['sufficiency']:.3f}")
print()
print("STILL TO DO BY HAND:")
print("  - Native speaker fills native_speaker_ok in word_boundary_check.csv (≥3 Kannada items)")
print("  - Native speaker fills native_speaker_reason in error_analysis_kn.csv")
