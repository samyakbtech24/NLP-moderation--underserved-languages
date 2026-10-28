# =============================================================================
# FairMod — Notebook 2: Baseline, MuRIL Fine-tuning & Transfer Experiments (P2)
# =============================================================================
# PURPOSE : Step 4  → TF-IDF + Logistic Regression baseline per language
#           Step 5  → Fine-tune MuRIL on the pooled multilingual training set
#           Step 6  → Cross-lingual transfer experiments B1–B5 (target: Kannada)
#           Step 6b → xlm-roberta-base comparison run (same data + settings)
#
# INPUTS  : processed/train.csv, processed/val.csv, processed/test.csv
#           (written by 01_data_preparation.py — test.csv is FROZEN)
# OUTPUTS : results/baseline_results.json   → Table I, column 1
#           results/muril_results.json      → Table I, column 3
#           results/xlmr_results.json       → Table I, column 2
#           results/table_I.csv             → Table I, ready for P4
#           results/transfer_results.json   → Figure 2 raw numbers
#           results/transfer_curve.csv / .png → Figure 2
#           checkpoints/muril_pooled/final  → model P3 loads for app + explainer
#
# DECISION LOG (Step 4–6 — locked before running):
#   - METRIC         : macro-F1 per language, never accuracy (master §5.2)
#   - BASELINE       : TF-IDF char n-grams + LogisticRegression, one model per
#                      language, class_weight='balanced' (master §5.1)
#   - TRAINING       : max_length=128, fp16, batch 32, lr 2e-5, 3 epochs,
#                      class-weighted cross-entropy, best checkpoint by
#                      macro-F1 on val (master §5.2 — do NOT change)
#   - TRANSFER TARGET: Kannada (kn) — native-speaker language (master §3.4 B)
#                      Few-shot samples are NESTED (100 ⊂ 500 ⊂ 2000) and
#                      stratified by source × label, seed 42
#   - TRANSFER VAL   : B1–B4 select checkpoints on non-target val only, so the
#                      target language never leaks in through model selection.
#                      B5 (monolingual) selects on target val.
#   - All runs are evaluated on the FROZEN test set. Seed 42 everywhere.
#
# HOW TO RUN IN GOOGLE COLAB:
#   1. Runtime → Change runtime type → T4 GPU
#   2. Each block between "# CELL X" comments = one Colab cell
#   3. Run cells IN ORDER. Part A (baseline) needs no GPU.
#   4. Every training run saves its results the moment it finishes. If Colab
#      disconnects, re-run Cells 1–3 + 9–11 and the finished runs are skipped.
#   5. Paste the full printed output back after each cell.
#
# ESTIMATED T4 TIME: Part B ~45 min | Part C ~2.5 h | Part D ~45 min
# =============================================================================


# ─── CELL 1 : Install dependencies ─────────────────────────────────────────
# Takes ~60 seconds. Restart runtime if Colab asks.

get_ipython().system('pip install -q transformers datasets accelerate scikit-learn pandas matplotlib')


# ─── CELL 2 : Imports and reproducibility seed ──────────────────────────────

import os
import json
import time
import random
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, classification_report

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

LANGS = ['hi', 'kn', 'mr', 'bn']
LANG_NAMES = {'hi': 'Hindi', 'kn': 'Kannada', 'mr': 'Marathi', 'bn': 'Bengali'}
print("Imports done. Seed =", SEED)


# ─── CELL 3 : Mount Google Drive and load processed data ────────────────────

from google.colab import drive
drive.mount('/content/drive')

BASE = '/content/drive/MyDrive/fairmod'
PROC = os.path.join(BASE, 'processed')
RES  = os.path.join(BASE, 'results')
CKPT = os.path.join(BASE, 'checkpoints')

for folder in [PROC, RES, CKPT]:
    os.makedirs(folder, exist_ok=True)

# If Notebook 1's outputs aren't on Drive yet, upload train.csv, val.csv and
# test.csv from the repo's processed/ folder (file picker opens below).
missing = [f for f in ['train.csv', 'val.csv', 'test.csv'] if not os.path.exists(os.path.join(PROC, f))]
if missing:
    from google.colab import files
    print("Not on Drive yet:", missing, "— pick them from your local processed/ folder.")
    for fname, content in files.upload().items():
        with open(os.path.join(PROC, fname), 'wb') as f:
            f.write(content)
        print(f"  Saved: {os.path.join(PROC, fname)}")

train_df = pd.read_csv(os.path.join(PROC, 'train.csv'))
val_df   = pd.read_csv(os.path.join(PROC, 'val.csv'))
test_df  = pd.read_csv(os.path.join(PROC, 'test.csv'))   # FROZEN — read only

for df in [train_df, val_df, test_df]:
    df['text']  = df['text'].astype(str)
    df['label'] = df['label'].astype(int)

# Sanity checks — Notebook 1 schema (master §4.7)
for name, df in [('train', train_df), ('val', val_df), ('test', test_df)]:
    assert list(df.columns) == ['text', 'label', 'language', 'source'], f"{name} columns: {list(df.columns)}"
    assert set(df['label'].unique()) <= {0, 1}, f"{name} has non-binary labels"
    assert set(df['language'].unique()) == set(LANGS), f"{name} languages: {df['language'].unique()}"

print(f"TRAIN : {len(train_df):,} rows | VAL : {len(val_df):,} rows | TEST : {len(test_df):,} rows")
print(train_df.groupby(['language', 'source'])['label'].agg(total='count', abusive='sum').to_string())


# ─── CELL 4 : Shared helpers ────────────────────────────────────────────────

def macro_f1(y_true, y_pred):
    return float(f1_score(y_true, y_pred, average='macro'))

def per_language_f1(df, preds):
    """
    Macro-F1 per language, per source (Kannada has two sources), and overall.
    `df` must be in the same row order as `preds`.
    """
    df = df.assign(pred=np.asarray(preds))
    out = {'overall': macro_f1(df['label'], df['pred']), 'per_language': {}, 'per_source': {}}
    for lang in LANGS:
        sub = df[df['language'] == lang]
        if len(sub):
            out['per_language'][lang] = macro_f1(sub['label'], sub['pred'])
    for (lang, src), sub in df.groupby(['language', 'source']):
        out['per_source'][f'{lang}/{src}'] = macro_f1(sub['label'], sub['pred'])
    return out

def save_json(obj, fname):
    path = os.path.join(RES, fname)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    print(f"  Saved → {path}")

def print_scores(title, scores):
    print(f"\n{title}")
    print(f"  {'overall':<20} {scores['overall']:.4f}")
    for k, v in scores['per_language'].items():
        print(f"  {LANG_NAMES[k]:<20} {v:.4f}")
    for k, v in scores['per_source'].items():
        print(f"    {k:<18} {v:.4f}")

print("Helpers ready.")


# =============================================================================
# PART A — STEP 4 : TF-IDF + LOGISTIC REGRESSION BASELINE (no GPU needed)
# =============================================================================

# ─── CELL 5 : Train one baseline per language ───────────────────────────────
# Character n-grams (not word n-grams): Indic scripts and code-mixed Roman text
# have heavy spelling variation, and char n-grams are robust to it.
# class_weight='balanced' compensates for the Bengali 2:1 skew.

baseline = {'model': 'tfidf_char_2-5_logreg', 'seed': SEED,
            'val': {'per_language': {}, 'per_source': {}},
            'test': {'per_language': {}, 'per_source': {}}}
val_preds, test_preds = [], []

for lang in LANGS:
    tr = train_df[train_df['language'] == lang]
    va = val_df[val_df['language'] == lang]
    te = test_df[test_df['language'] == lang]

    t0 = time.time()
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(2, 5), min_df=2,
                          max_features=200_000, sublinear_tf=True)
    X_tr = vec.fit_transform(tr['text'])
    clf = LogisticRegression(max_iter=2000, class_weight='balanced', random_state=SEED)
    clf.fit(X_tr, tr['label'])

    va_pred = clf.predict(vec.transform(va['text']))
    te_pred = clf.predict(vec.transform(te['text']))
    val_preds.append(pd.Series(va_pred, index=va.index))
    test_preds.append(pd.Series(te_pred, index=te.index))

    print(f"{LANG_NAMES[lang]:<8} train={len(tr):>6,}  val F1={macro_f1(va['label'], va_pred):.4f}  "
          f"test F1={macro_f1(te['label'], te_pred):.4f}  ({time.time()-t0:.0f}s)")

baseline['val']  = per_language_f1(val_df,  pd.concat(val_preds).sort_index())
baseline['test'] = per_language_f1(test_df, pd.concat(test_preds).sort_index())


# ─── CELL 6 : Save baseline results ─────────────────────────────────────────
# These numbers are Column 1 of Table I. Paste this output to P4.

print_scores("BASELINE — VAL macro-F1", baseline['val'])
print_scores("BASELINE — TEST macro-F1 (Table I, column 1)", baseline['test'])
save_json(baseline, 'baseline_results.json')


# =============================================================================
# PART B — STEP 5 : MuRIL FINE-TUNING ON POOLED MULTILINGUAL DATA (GPU)
# =============================================================================

# ─── CELL 7 : GPU check ─────────────────────────────────────────────────────

import torch
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
else:
    print("WARNING: no GPU. Runtime → Change runtime type → T4 GPU, then re-run from Cell 1.")


# ─── CELL 8 : Training configuration (master §5.2 — CONFIRMED, do not edit) ──
# If you hit an out-of-memory error, follow master §5.3 IN ORDER:
#   max_length=128 (already set) → fp16 (already set) →
#   BATCH_SIZE=16 AND GRAD_ACCUM=2 (keeps effective batch at 32)

MAX_LENGTH    = 128
BATCH_SIZE    = 32
GRAD_ACCUM    = 1
LEARNING_RATE = 2e-5
EPOCHS        = 3
FP16          = torch.cuda.is_available()

MURIL = 'google/muril-base-cased'
XLMR  = 'xlm-roberta-base'
print(f"max_length={MAX_LENGTH} batch={BATCH_SIZE}x{GRAD_ACCUM} lr={LEARNING_RATE} "
      f"epochs={EPOCHS} fp16={FP16}")


# ─── CELL 9 : Fine-tuning machinery ─────────────────────────────────────────
# WeightedTrainer = HuggingFace Trainer with class-weighted cross-entropy.
# Class weights are computed from each run's own training labels.

from datasets import Dataset
from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                          DataCollatorWithPadding, Trainer, TrainingArguments,
                          set_seed)
from sklearn.utils.class_weight import compute_class_weight

class WeightedTrainer(Trainer):
    def __init__(self, *args, class_weights=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels  = inputs.pop('labels')
        outputs = model(**inputs)
        weights = self.class_weights.to(outputs.logits.device, dtype=outputs.logits.dtype)
        loss = torch.nn.functional.cross_entropy(outputs.logits, labels, weight=weights)
        return (loss, outputs) if return_outputs else loss

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    return {'macro_f1': macro_f1(labels, np.argmax(logits, axis=-1))}

_tokenizers = {}
def get_tokenizer(model_name):
    if model_name not in _tokenizers:
        _tokenizers[model_name] = AutoTokenizer.from_pretrained(model_name)
    return _tokenizers[model_name]

def to_dataset(df, tokenizer):
    ds = Dataset.from_pandas(df[['text', 'label']].rename(columns={'label': 'labels'}),
                             preserve_index=False)
    return ds.map(lambda b: tokenizer(b['text'], truncation=True, max_length=MAX_LENGTH),
                  batched=True, remove_columns=['text'])

def finetune(model_name, run_name, tr_df, va_df, save_final=False):
    """
    Fine-tune `model_name` on tr_df, pick the best epoch by macro-F1 on va_df,
    then evaluate on the FROZEN test set. Returns the per-language score dict.
    """
    set_seed(SEED)
    tok = get_tokenizer(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name, num_labels=2,
        id2label={0: 'normal', 1: 'abusive'}, label2id={'normal': 0, 'abusive': 1})

    weights = compute_class_weight('balanced', classes=np.array([0, 1]), y=tr_df['label'].values)
    print(f"[{run_name}] train={len(tr_df):,} val={len(va_df):,} "
          f"class weights: normal={weights[0]:.3f} abusive={weights[1]:.3f}")

    out_dir = os.path.join(CKPT, run_name)
    # 10% linear warmup, as an int step count (works on transformers 4.x and 5.x)
    total_steps = int(np.ceil(len(tr_df) / (BATCH_SIZE * GRAD_ACCUM))) * EPOCHS
    args = TrainingArguments(
        output_dir=out_dir,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LEARNING_RATE,
        num_train_epochs=EPOCHS,
        weight_decay=0.01,
        warmup_steps=int(0.1 * total_steps),
        fp16=FP16,
        eval_strategy='epoch',
        save_strategy='epoch',
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model='macro_f1',   # never accuracy (master §5.2)
        greater_is_better=True,
        logging_steps=200,
        report_to='none',
        seed=SEED,
        data_seed=SEED,
    )
    trainer = WeightedTrainer(
        model=model, args=args,
        train_dataset=to_dataset(tr_df, tok),
        eval_dataset=to_dataset(va_df, tok),
        processing_class=tok,
        data_collator=DataCollatorWithPadding(tok),
        compute_metrics=compute_metrics,
        class_weights=torch.tensor(weights, dtype=torch.float),
    )

    t0 = time.time()
    trainer.train()
    train_minutes = (time.time() - t0) / 60

    logits = trainer.predict(to_dataset(test_df, tok)).predictions
    scores = per_language_f1(test_df, np.argmax(logits, axis=-1))
    scores.update({'model': model_name, 'run': run_name, 'n_train': int(len(tr_df)),
                   'best_val_macro_f1': float(trainer.state.best_metric),
                   'train_minutes': round(train_minutes, 1), 'seed': SEED})

    if save_final:
        final_dir = os.path.join(out_dir, 'final')
        trainer.save_model(final_dir)
        tok.save_pretrained(final_dir)
        scores['checkpoint'] = final_dir
        print(f"  Final model saved → {final_dir}")

    del trainer, model
    torch.cuda.empty_cache()
    return scores

def run_once(fname, fn):
    """Skip a run whose results file already exists (Colab-disconnect safety)."""
    path = os.path.join(RES, fname)
    if os.path.exists(path):
        print(f"  {fname} already exists — skipping. Delete it to re-run.")
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    result = fn()
    save_json(result, fname)
    return result

print("Fine-tuning machinery ready.")


# ─── CELL 10 : Fine-tune MuRIL on the pooled training set (~45 min on T4) ────
# This checkpoint is the one P3 uses for the explainer and the app.

muril = run_once('muril_results.json',
                 lambda: finetune(MURIL, 'muril_pooled', train_df, val_df, save_final=True))
print_scores("MuRIL (pooled) — TEST macro-F1 (Table I, column 3)", muril)


# =============================================================================
# PART C — STEP 6 : CROSS-LINGUAL TRANSFER EXPERIMENTS B1–B5 (master §3.4 B)
# =============================================================================

# ─── CELL 11 : Build the five training conditions ───────────────────────────
# Target = Kannada. Few-shot samples come from ONE fixed shuffled ordering of the
# Kannada training set, so B2's 100 rows ⊂ B3's 500 ⊂ B4's 2000. This makes the
# curve measure "more data", not "different data".
# The ordering is stratified by source × label so every prefix keeps roughly the
# MACD / DravidianCodeMix and abusive / normal proportions of the full set.

TARGET = 'kn'
FEW_SHOT_NS = [100, 500, 2000]

tgt_train = train_df[train_df['language'] == TARGET]
src_train = train_df[train_df['language'] != TARGET]
src_val   = val_df[val_df['language'] != TARGET]
tgt_val   = val_df[val_df['language'] == TARGET]

def stratified_order(df, seed=SEED):
    """Interleave shuffled source×label groups proportionally."""
    rng = np.random.default_rng(seed)
    keys = rng.random(len(df))
    # rank within each group, normalised to [0,1) → proportional interleaving
    rank = (pd.Series(keys, index=df.index)
              .groupby([df['source'], df['label']]).rank(method='first') - 1)
    size = df.groupby(['source', 'label'])['label'].transform('size')
    return df.loc[(rank / size + keys * 1e-9).sort_values().index]

tgt_ordered = stratified_order(tgt_train)

conditions = {'B1_zero_shot': (src_train, src_val)}
for n in FEW_SHOT_NS:
    conditions[f'B{FEW_SHOT_NS.index(n)+2}_few_shot_{n}'] = (
        pd.concat([src_train, tgt_ordered.head(n)]).sample(frac=1, random_state=SEED), src_val)
conditions['B5_monolingual'] = (tgt_train, tgt_val)

for name, (tr, va) in conditions.items():
    n_tgt = int((tr['language'] == TARGET).sum())
    print(f"{name:<22} train={len(tr):>6,}  target rows={n_tgt:>6,}  "
          f"abusive={tr['label'].mean():.0%}  val={len(va):,}")


# ─── CELL 12 : Run B1–B5 (~2.5 h on T4, can run unattended) ─────────────────
# Each finished run is saved immediately. If Colab disconnects, re-run Cells
# 1–3, 7–9, 11 and this cell — completed conditions are skipped.

transfer = {}
for name, (tr, va) in conditions.items():
    print("\n" + "=" * 60 + f"\n{name}\n" + "=" * 60)
    transfer[name] = run_once(f'transfer_{name}.json',
                              lambda tr=tr, va=va, name=name: finetune(MURIL, f'transfer_{name}', tr, va))
    print(f"  {LANG_NAMES[TARGET]} test macro-F1: {transfer[name]['per_language'][TARGET]:.4f}")


# ─── CELL 13 : Transfer curve — Figure 2 ────────────────────────────────────
# x = number of Kannada training examples, y = Kannada test macro-F1.
# "% of full" = relative to the pooled MuRIL model from Cell 10.

import matplotlib.pyplot as plt

full_f1 = muril['per_language'][TARGET]
rows = []
for name, s in transfer.items():
    n_tgt = int((conditions[name][0]['language'] == TARGET).sum())
    rows.append({'condition': name, 'n_target_examples': n_tgt,
                 'target_macro_f1': round(s['per_language'][TARGET], 4),
                 'pct_of_pooled': round(100 * s['per_language'][TARGET] / full_f1, 1),
                 **{f'f1_{k}': round(v, 4) for k, v in s['per_source'].items()
                    if k.startswith(TARGET)}})
rows.append({'condition': 'A_pooled_all', 'n_target_examples': len(tgt_train),
             'target_macro_f1': round(full_f1, 4), 'pct_of_pooled': 100.0,
             **{f'f1_{k}': round(v, 4) for k, v in muril['per_source'].items()
                if k.startswith(TARGET)}})
curve = pd.DataFrame(rows)
print(curve.to_string(index=False))
curve.to_csv(os.path.join(RES, 'transfer_curve.csv'), index=False)
save_json({'target': TARGET, 'pooled_reference_f1': full_f1, 'runs': transfer},
          'transfer_results.json')

few = curve[curve['condition'].str.match(r'B[1-4]')].sort_values('n_target_examples')
fig, ax = plt.subplots(figsize=(6, 4))
ax.plot(few['n_target_examples'].clip(lower=10), few['target_macro_f1'], 'o-',
        label='Other languages + N Kannada')
for cond, style, label in [('B5_monolingual', '--', 'Kannada only (B5)'),
                           ('A_pooled_all', ':', 'All languages, full Kannada')]:
    ax.axhline(curve.loc[curve['condition'] == cond, 'target_macro_f1'].item(),
               linestyle=style, color='grey', label=label)
ax.set_xscale('log')
ax.set_xticks([10, 100, 500, 2000])
ax.set_xticklabels(['0', '100', '500', '2000'])
ax.set_xlabel('Kannada training examples (N)')
ax.set_ylabel('Kannada test macro-F1')
ax.set_title('Cross-lingual transfer to Kannada (MuRIL)')
ax.legend(fontsize=8)
fig.tight_layout()
fig.savefig(os.path.join(RES, 'transfer_curve.png'), dpi=200)
plt.show()
print("Saved transfer_curve.csv and transfer_curve.png → give both to P4.")


# =============================================================================
# PART D — STEP 6b : XLM-RoBERTa COMPARISON + TABLE I
# =============================================================================

# ─── CELL 14 : Fine-tune xlm-roberta-base, identical data + settings ────────

xlmr = run_once('xlmr_results.json',
                lambda: finetune(XLMR, 'xlmr_pooled', train_df, val_df))
print_scores("XLM-R (pooled) — TEST macro-F1 (Table I, column 2)", xlmr)


# ─── CELL 15 : Assemble Table I ─────────────────────────────────────────────
# Rows = languages (+ Kannada per source), columns = models. Test macro-F1.
# Success criterion 1 (master §1.6): MuRIL beats the baseline in every language.

with open(os.path.join(RES, 'baseline_results.json'), encoding='utf-8') as f:
    base_test = json.load(f)['test']

def column(scores):
    return {**{LANG_NAMES[k]: v for k, v in scores['per_language'].items()},
            **{k: v for k, v in scores['per_source'].items() if k.startswith('kn/')},
            'Overall': scores['overall']}

table = pd.DataFrame({'TF-IDF + LogReg': column(base_test),
                      'XLM-R base': column(xlmr),
                      'MuRIL base': column(muril)}).round(4)
table.index.name = 'language'
print(table.to_string())
table.to_csv(os.path.join(RES, 'table_I.csv'))

beats = {LANG_NAMES[l]: muril['per_language'][l] > base_test['per_language'][l] for l in LANGS}
print("\nMuRIL beats baseline per language:", beats)
print("SUCCESS CRITERION 1:", "MET" if all(beats.values()) else "NOT MET — report honestly")


# ─── CELL 16 : Final summary for the team ───────────────────────────────────
# Paste the full output of this cell into the team chat.

print("=" * 60)
print("NOTEBOOK 2 — COMPLETE SUMMARY")
print("=" * 60)
print(f"  Baseline overall test macro-F1 : {base_test['overall']:.4f}")
print(f"  XLM-R    overall test macro-F1 : {xlmr['overall']:.4f}")
print(f"  MuRIL    overall test macro-F1 : {muril['overall']:.4f}")
print(f"  MuRIL checkpoint for P3        : {muril.get('checkpoint')}")
print()
print("  Transfer to Kannada (test macro-F1):")
for _, r in curve.iterrows():
    print(f"    {r['condition']:<22} N={r['n_target_examples']:>6,}  "
          f"F1={r['target_macro_f1']:.4f}  ({r['pct_of_pooled']}% of pooled)")
print()
print("FILES FOR P4 (results/):")
for fname in ['baseline_results.json', 'muril_results.json', 'xlmr_results.json',
              'table_I.csv', 'transfer_results.json', 'transfer_curve.csv', 'transfer_curve.png']:
    print(f"  {fname:<24} {'OK' if os.path.exists(os.path.join(RES, fname)) else 'MISSING'}")


# ─── CELL 17 : Download results to put in the repo ──────────────────────────
# Downloads results.zip → unzip it into the repo's results/ folder.
# The model itself (~950 MB) stays on Drive at checkpoints/muril_pooled/final:
# download that folder from Drive if you want to run app.py locally, or push
# it to the HF Hub with 03_explain_eval.py Cell 13.

import shutil
from google.colab import files
shutil.make_archive('/content/results', 'zip', RES)
files.download('/content/results.zip')
