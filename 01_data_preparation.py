# =============================================================================
# FairMod — Notebook 1: Data Preparation Pipeline
# =============================================================================
# PURPOSE : Load all raw datasets → fix labels → unify schema → deduplicate
#           → split → freeze test set → verify no leakage → save to Drive
#
# DECISION LOG (Step 3b — locked before running):
#   - SPLITTING STRATEGY : Publisher splits for MACD, MahaHate, DravidianCodeMix
#                          Bengali has no official splits → stratified 80/10/10
#   - NATIVE SPEAKER LANGUAGE : Kannada (confirmed 26 Oct 2026)
#   - FOUR LANGUAGES CHOSEN   : Hindi, Kannada, Marathi, Bengali
#   - DravidianCodeMix Kannada: multi-class offensive → collapse to binary;
#     drop 'not-Kannada' rows (language-ID noise, not hate-speech labels)
#
# HOW TO RUN IN GOOGLE COLAB:
#   1. Open Google Colab → New Notebook
#   2. Each block between "# CELL X" comments = one Colab cell
#   3. Run cells IN ORDER — do not skip
#   4. Paste the full printed output back after each cell
# =============================================================================


# ─── CELL 1 : Install dependencies ─────────────────────────────────────────
# Run this first. Takes ~60 seconds. Restart runtime if Colab asks.

get_ipython().system('pip install -q openpyxl pandas scikit-learn')


# ─── CELL 2 : Imports and reproducibility seed ──────────────────────────────

import os
import re
import hashlib
import random
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
print("Imports done. Seed =", SEED)


# ─── CELL 3 : Mount Google Drive ────────────────────────────────────────────
# A link will pop up — click it, sign in, copy the authorisation code back.

from google.colab import drive
drive.mount('/content/drive')

BASE = '/content/drive/MyDrive/fairmod'
RAW  = os.path.join(BASE, 'raw')
PROC = os.path.join(BASE, 'processed')
RES  = os.path.join(BASE, 'results')

for folder in [RAW, PROC, RES]:
    os.makedirs(folder, exist_ok=True)

print("Drive mounted. Folder:", BASE)


# ─── CELL 4 : Upload raw dataset files ──────────────────────────────────────
# A file picker will open. Select ALL files listed below at once.
#
# Upload these files (find them in your NLP DATASETS folder):
#
# From MACD-main/dataset/:
#   hindi_train.csv, hindi_val.csv, hindi_test.csv
#   kannada_train.csv, kannada_val.csv, kannada_test.csv
#
# From l3-Cube-MahaHate/2-class/:
#   hate_bin_train.xlsx, hate_bin_valid.xlsx, hate_bin_test.xlsx
#
# From "Bengali hate speech .csv"/
#   "Bengali hate speech .csv"
#
# From DravidianCodeMix-Dataset-main/DravidianCodeMix/:
#   kannada_offensive_train.csv
#   kannada_offensive_dev.csv
#   kannada_offensive_test.csv

from google.colab import files

print("Pick all 13 raw dataset files from the file picker below...")
uploaded = files.upload()

for fname, content in uploaded.items():
    dest = os.path.join(RAW, fname)
    with open(dest, 'wb') as f:
        f.write(content)
    print(f"  Saved: {dest}")

print(f"\nUploaded {len(uploaded)} files to Drive/raw/")
print("Files in raw/:", os.listdir(RAW))


# ─── CELL 5 : Define helper functions ───────────────────────────────────────

def clean_text(text):
    """
    Minimal cleaning — removes URLs, @usernames, extra whitespace.
    IMPORTANT: Does NOT remove emoji. Emoji carry meaning in hate-speech data.
    """
    text = str(text)
    text = re.sub(r'http\S+|www\.\S+', '', text)   # remove URLs
    text = re.sub(r'@\w+', '', text)                # remove @mentions
    text = re.sub(r'\s+', ' ', text).strip()        # collapse whitespace
    return text

def text_hash(text):
    """
    MD5 hash of lowercased, whitespace-normalised text.
    Used to detect duplicate comments across datasets.
    """
    normalised = ' '.join(str(text).lower().split())
    return hashlib.md5(normalised.encode('utf-8')).hexdigest()

print("Helper functions ready.")


# ─── CELL 6 : Load MACD — Hindi ─────────────────────────────────────────────
# Using publisher splits (dataset/ folder — the original MACD splits).
#
# CRITICAL LABEL INVERSION (verified by manual inspection on 26 Oct 2026):
#   Raw MACD label 0 = ABUSIVE  →  FairMod label 1
#   Raw MACD label 1 = NORMAL   →  FairMod label 0
# If you change this, you must re-run EVERYTHING.

def load_macd_split(raw_dir, lang, split_name):
    fpath = os.path.join(raw_dir, f'{lang}_{split_name}.csv')
    df = pd.read_csv(fpath)
    assert 'label' in df.columns, f"No 'label' column in {fpath}. Columns: {list(df.columns)}"
    assert 'text'  in df.columns, f"No 'text' column in {fpath}"
    df = df[['text', 'label']].copy()
    # INVERT MACD labels: raw 0 → abusive (1), raw 1 → normal (0)
    df['label'] = df['label'].map({0: 1, 1: 0})
    df['text']  = df['text'].apply(clean_text)
    df.dropna(subset=['text', 'label'], inplace=True)
    df = df[df['text'].str.len() > 0]
    df['label'] = df['label'].astype(int)
    return df

hindi_train = load_macd_split(RAW, 'hindi', 'train')
hindi_val   = load_macd_split(RAW, 'hindi', 'val')
hindi_test  = load_macd_split(RAW, 'hindi', 'test')

for df in [hindi_train, hindi_val, hindi_test]:
    df['language'] = 'hi'
    df['source']   = 'macd'

print("MACD Hindi loaded:")
print(f"  Train : {len(hindi_train):,} rows | abusive={hindi_train['label'].sum():,}")
print(f"  Val   : {len(hindi_val):,} rows   | abusive={hindi_val['label'].sum():,}")
print(f"  Test  : {len(hindi_test):,} rows  | abusive={hindi_test['label'].sum():,}")
print()
print("=== HINDI SPOT-CHECK — 5 rows labelled ABUSIVE ===")
print("Confirm these look offensive before continuing!\n")
for i, t in enumerate(hindi_train[hindi_train['label']==1]['text'].sample(5, random_state=SEED), 1):
    print(f"  {i}. {t[:150]}")


# ─── CELL 7 : Load MACD — Kannada ───────────────────────────────────────────
# Same MACD label inversion applies (0=abusive, 1=normal in raw files).
# Kannada is our native-speaker language — gets extra scrutiny.

kannada_macd_train = load_macd_split(RAW, 'kannada', 'train')
kannada_macd_val   = load_macd_split(RAW, 'kannada', 'val')
kannada_macd_test  = load_macd_split(RAW, 'kannada', 'test')

for df in [kannada_macd_train, kannada_macd_val, kannada_macd_test]:
    df['language'] = 'kn'
    df['source']   = 'macd'

print("MACD Kannada (native script) loaded:")
print(f"  Train : {len(kannada_macd_train):,} rows | abusive={kannada_macd_train['label'].sum():,}")
print(f"  Val   : {len(kannada_macd_val):,} rows   | abusive={kannada_macd_val['label'].sum():,}")
print(f"  Test  : {len(kannada_macd_test):,} rows  | abusive={kannada_macd_test['label'].sum():,}")
print()
print("=== KANNADA SPOT-CHECK — 5 rows labelled ABUSIVE ===")
print("Native Kannada speaker: please confirm these 5 look offensive!\n")
for i, t in enumerate(kannada_macd_train[kannada_macd_train['label']==1]['text'].sample(5, random_state=SEED), 1):
    print(f"  {i}. {t[:150]}")


# ─── CELL 8 : Load DravidianCodeMix — Kannada (code-mixed Roman script) ─────
# Format: tab-separated (\t), no header row. Two columns: text, label.
# Labels are multi-class strings, not binary — must collapse.
#
# LABEL MAPPING (confirmed by inspection):
#   'Not_offensive'                    → FairMod 0 (normal)
#   'not-Kannada'                      → DROP (language-ID noise, not hate data)
#   'Offensive_Targeted_Insult_*'      → FairMod 1 (abusive)
#   'Offensive_Untargetede'            → FairMod 1 (abusive)
#   Any other Offensive_* variant      → FairMod 1 (abusive)
#
# Publisher splits exist (train/dev/test) — using them directly.

def load_dravidian_kn(raw_dir, split_name):
    fname_map = {
        'train': 'kannada_offensive_train.csv',
        'dev':   'kannada_offensive_dev.csv',
        'test':  'kannada_offensive_test.csv',
    }
    fpath = os.path.join(raw_dir, fname_map[split_name])
    df = pd.read_csv(fpath, sep='\t', header=None, names=['text', 'label'],
                     on_bad_lines='skip', encoding='utf-8')
    original_len = len(df)
    # Drop rows marked as 'not-Kannada' — language identification noise
    df = df[df['label'] != 'not-Kannada'].copy()
    dropped = original_len - len(df)
    print(f"  [{split_name}] Dropped {dropped} 'not-Kannada' rows")
    # Collapse to binary: Not_offensive=0, everything else Offensive=1
    df['label'] = df['label'].apply(
        lambda x: 0 if str(x).strip() == 'Not_offensive' else 1
    )
    df['text'] = df['text'].apply(clean_text)
    df.dropna(subset=['text', 'label'], inplace=True)
    df = df[df['text'].str.len() > 0]
    df['label'] = df['label'].astype(int)
    return df

print("Loading DravidianCodeMix Kannada (Roman-script, code-mixed)...")
kn_drav_train = load_dravidian_kn(RAW, 'train')
kn_drav_val   = load_dravidian_kn(RAW, 'dev')
kn_drav_test  = load_dravidian_kn(RAW, 'test')

for df in [kn_drav_train, kn_drav_val, kn_drav_test]:
    df['language'] = 'kn'
    df['source']   = 'dravidian_kn'

print("\nDravidianCodeMix Kannada loaded:")
print(f"  Train : {len(kn_drav_train):,} rows | abusive={kn_drav_train['label'].sum():,}")
print(f"  Val   : {len(kn_drav_val):,} rows   | abusive={kn_drav_val['label'].sum():,}")
print(f"  Test  : {len(kn_drav_test):,} rows  | abusive={kn_drav_test['label'].sum():,}")


# ─── CELL 9 : Load MahaHate — Marathi ───────────────────────────────────────
# Format: Excel (.xlsx), 2-class binary splits.
# Labels: 'HOF' (Hate Or offensive) → 1, 'NOT' (normal) → 0
# Publisher splits: hate_bin_train.xlsx / hate_bin_valid.xlsx / hate_bin_test.xlsx

def load_mahahate(raw_dir, split_name):
    fname_map = {'train': 'hate_bin_train.xlsx',
                 'val':   'hate_bin_valid.xlsx',
                 'test':  'hate_bin_test.xlsx'}
    fpath = os.path.join(raw_dir, fname_map[split_name])
    df = pd.read_excel(fpath, engine='openpyxl')
    print(f"  [{split_name}] Columns: {list(df.columns)}")
    # Auto-detect text and label columns (handles minor header variations)
    text_col  = next((c for c in df.columns if any(k in c.lower() for k in ['text','tweet','comment','sentence'])), df.columns[0])
    label_col = next((c for c in df.columns if any(k in c.lower() for k in ['label','category','class'])), df.columns[1])
    df = df[[text_col, label_col]].copy()
    df.columns = ['text', 'label_raw']
    df['label'] = df['label_raw'].map({'HOF': 1, 'NOT': 0})
    unmapped = df['label'].isna().sum()
    if unmapped > 0:
        print(f"  WARNING: {unmapped} unmapped label values — unique values: {df['label_raw'].unique()}")
    df['text'] = df['text'].apply(clean_text)
    df.dropna(subset=['text', 'label'], inplace=True)
    df = df[df['text'].str.len() > 0]
    df['label'] = df['label'].astype(int)
    return df[['text', 'label']]

print("Loading MahaHate Marathi (Excel format)...")
mr_train = load_mahahate(RAW, 'train')
mr_val   = load_mahahate(RAW, 'val')
mr_test  = load_mahahate(RAW, 'test')

for df in [mr_train, mr_val, mr_test]:
    df['language'] = 'mr'
    df['source']   = 'mahahate'

print("\nMahaHate Marathi loaded:")
print(f"  Train : {len(mr_train):,} rows | abusive={mr_train['label'].sum():,}")
print(f"  Val   : {len(mr_val):,} rows   | abusive={mr_val['label'].sum():,}")
print(f"  Test  : {len(mr_test):,} rows  | abusive={mr_test['label'].sum():,}")


# ─── CELL 10 : Load Bengali Hate Speech ──────────────────────────────────────
# Format: CSV, single file (no publisher splits).
# Columns: 'sentence' (text), 'hate' (label), 'category' (topic metadata)
# Label polarity is NORMAL: 1=hate, 0=not (no inversion needed).
# Bengali is 2:1 imbalanced → CLASS-WEIGHTED LOSS IS MANDATORY in Notebook 2.

fpath = os.path.join(RAW, 'Bengali hate speech .csv')
bn_raw = pd.read_csv(fpath)

print("Bengali raw shape:", bn_raw.shape)
print("Bengali columns:", list(bn_raw.columns))
print("Bengali label distribution:", bn_raw['hate'].value_counts().to_dict())

bn_raw = bn_raw.rename(columns={'sentence': 'text', 'hate': 'label'})
bn_raw['text']     = bn_raw['text'].apply(clean_text)
bn_raw['language'] = 'bn'
bn_raw['source']   = 'bengali_hs'
bn_raw['label']    = bn_raw['label'].astype(int)
bn_raw.dropna(subset=['text', 'label'], inplace=True)
bn_raw = bn_raw[bn_raw['text'].str.len() > 0]

# Stratified 80/10/10 split
bn_trainval, bn_test = train_test_split(
    bn_raw, test_size=0.10, random_state=SEED, stratify=bn_raw['label']
)
bn_train, bn_val = train_test_split(
    bn_trainval, test_size=(len(bn_raw)*0.10 / len(bn_trainval)),
    random_state=SEED, stratify=bn_trainval['label']
)

print("\nBengali split (stratified 80/10/10):")
print(f"  Train : {len(bn_train):,} rows | abusive={bn_train['label'].sum():,}")
print(f"  Val   : {len(bn_val):,} rows   | abusive={bn_val['label'].sum():,}")
print(f"  Test  : {len(bn_test):,} rows  | abusive={bn_test['label'].sum():,}")
print("\nWARNING: Bengali is ~2:1 imbalanced. Class-weighted loss required in Notebook 2!")


# ─── CELL 11 : Merge all splits into unified DataFrames ──────────────────────
# Stack all languages into three DataFrames with identical columns:
#   text (str) | label (int) | language (str) | source (str)

COLS = ['text', 'label', 'language', 'source']

train_df = pd.concat([
    hindi_train[COLS], kannada_macd_train[COLS], kn_drav_train[COLS],
    mr_train[COLS],    bn_train[COLS],
], ignore_index=True)

val_df = pd.concat([
    hindi_val[COLS], kannada_macd_val[COLS], kn_drav_val[COLS],
    mr_val[COLS],    bn_val[COLS],
], ignore_index=True)

test_df = pd.concat([
    hindi_test[COLS], kannada_macd_test[COLS], kn_drav_test[COLS],
    mr_test[COLS],    bn_test[COLS],
], ignore_index=True)

for df in [train_df, val_df, test_df]:
    df['label']    = df['label'].astype(int)
    df['text']     = df['text'].astype(str)
    df['language'] = df['language'].astype(str)
    df['source']   = df['source'].astype(str)

print("All datasets merged:")
print(f"  TRAIN : {len(train_df):,} rows")
print(f"  VAL   : {len(val_df):,} rows")
print(f"  TEST  : {len(test_df):,} rows")
print()
print("Language + source breakdown in TRAIN:")
print(train_df.groupby(['language','source'])['label'].agg(total='count', abusive='sum').to_string())


# ─── CELL 12 : Global deduplication ──────────────────────────────────────────
# Remove identical comments within each split.
# Uses MD5 hash of lowercased, whitespace-normalised text.
# Rule: deduplicate within each split independently.

def dedup(df, split_name):
    before = len(df)
    df = df.copy()
    df['_h'] = df['text'].apply(text_hash)
    df = df.drop_duplicates(subset='_h').drop(columns='_h')
    after = len(df)
    print(f"  {split_name}: {before:,} → {after:,} rows  (removed {before-after:,} duplicates)")
    return df.reset_index(drop=True)

print("Deduplicating...")
train_df = dedup(train_df, 'TRAIN')
val_df   = dedup(val_df,   'VAL  ')
test_df  = dedup(test_df,  'TEST ')
print("Deduplication complete.")


# ─── CELL 13 : MANDATORY LEAKAGE ASSERTION ───────────────────────────────────
# This is a hard safety check. If it fails, stop everything and investigate.
# Ensures no training example appears in the test set.

print("Running leakage assertion...")

train_hashes = set(train_df['text'].apply(text_hash))
val_hashes   = set(val_df['text'].apply(text_hash))
test_hashes  = set(test_df['text'].apply(text_hash))

tr_te = train_hashes & test_hashes
va_te = val_hashes   & test_hashes

if tr_te:
    raise AssertionError(
        f"LEAKAGE DETECTED: {len(tr_te)} comments appear in BOTH train and test! "
        "Do NOT train anything. Fix the data pipeline first."
    )
if va_te:
    print(f"WARNING: {len(va_te)} comments appear in both val and test (less critical).")
else:
    print("No train-test overlap.")
    print("No val-test overlap.")

print("LEAKAGE ASSERTION PASSED — safe to proceed to training.")


# ─── CELL 14 : MANDATORY POLARITY SPOT-CHECK ─────────────────────────────────
# Print 5 abusive rows per source.
# Someone who reads the language must visually confirm these look offensive.
# If they look like normal friendly text → the label mapping is WRONG → stop.

print("=" * 60)
print("POLARITY SPOT-CHECK — rows mapped as ABUSIVE (label=1)")
print("Verify these look offensive before training!\n")
print("=" * 60)

for src in sorted(train_df['source'].unique()):
    subset = train_df[(train_df['source'] == src) & (train_df['label'] == 1)]
    print(f"\n--- Source: {src} ({len(subset):,} abusive rows) ---")
    for i, t in enumerate(subset['text'].sample(min(5, len(subset)), random_state=SEED), 1):
        print(f"  {i}. {t[:160]}")


# ─── CELL 15 : Class balance summary ─────────────────────────────────────────
# Per-language statistics for the training set.
# Copy this table into the paper's Methodology / Dataset section.

print("=" * 60)
print("CLASS BALANCE — TRAINING SET")
print("=" * 60)

rows = []
for lang in sorted(train_df['language'].unique()):
    sub = train_df[train_df['language'] == lang]
    total   = len(sub)
    abusive = int(sub['label'].sum())
    normal  = total - abusive
    srcs    = ', '.join(sorted(sub['source'].unique()))
    rows.append({
        'lang':    lang,
        'total':   total,
        'normal':  normal,
        'abusive': abusive,
        'balance': f"{normal/total*100:.0f}% N / {abusive/total*100:.0f}% A",
        'sources': srcs,
    })

bal_df = pd.DataFrame(rows)
print(bal_df.to_string(index=False))

bn_ratio = train_df[train_df['language']=='bn']['label'].value_counts(normalize=True).max()
if bn_ratio > 0.60:
    print("\nBengali class imbalance confirmed. Class-weighted loss is REQUIRED.")
else:
    print("\nClass balance looks reasonable.")


# ─── CELL 16 : Save to Google Drive ─────────────────────────────────────────
# Writes train.csv, val.csv, test.csv and class_balance.csv to Drive.
# TEST SET IS FROZEN AFTER THIS POINT.

train_path = os.path.join(PROC, 'train.csv')
val_path   = os.path.join(PROC, 'val.csv')
test_path  = os.path.join(PROC, 'test.csv')

train_df.to_csv(train_path, index=False, encoding='utf-8')
val_df.to_csv(val_path,     index=False, encoding='utf-8')
test_df.to_csv(test_path,   index=False, encoding='utf-8')
bal_df.to_csv(os.path.join(RES, 'class_balance.csv'), index=False)

print("=" * 60)
print("SAVED TO GOOGLE DRIVE")
print("=" * 60)
print(f"  train.csv  →  {train_path}  ({len(train_df):,} rows)")
print(f"  val.csv    →  {val_path}   ({len(val_df):,} rows)")
print(f"  test.csv   →  {test_path}   ({len(test_df):,} rows)")
print()
print("TEST SET IS NOW FROZEN.")
print("Do not regenerate. Any regeneration must be logged in master context §12.")


# ─── CELL 17 : Final audit summary ───────────────────────────────────────────
# Paste the full output of this cell back to the team and save in master context.

print()
print("=" * 60)
print("NOTEBOOK 1 — COMPLETE AUDIT SUMMARY")
print("=" * 60)
print()
print("DECISIONS LOCKED:")
print("  Splitting   : Publisher splits (MACD, MahaHate, DravidianCodeMix)")
print("                Stratified 80/10/10 for Bengali (no official splits)")
print("  Languages   : Hindi (hi), Kannada (kn), Marathi (mr), Bengali (bn)")
print("  Native lang : Kannada → error analysis + real-world test set (60 comments)")
print("  MACD labels : INVERTED (raw 0=abusive → FairMod 1; raw 1=normal → FairMod 0)")
print("  Dravidian   : multi-class collapsed to binary; not-Kannada rows dropped")
print("  Dedup       : MD5 hash, within-split only")
print("  Emoji       : PRESERVED")
print("  Seed        : 42 everywhere")
print()
print("FINAL SIZES:")
print(f"  TRAIN : {len(train_df):,}  rows  |  {train_df['label'].sum():,} abusive")
print(f"  VAL   : {len(val_df):,}  rows  |  {val_df['label'].sum():,} abusive")
print(f"  TEST  : {len(test_df):,}  rows  |  {test_df['label'].sum():,} abusive  [FROZEN]")
print()
print("SAFETY CHECKS:")
print("  Leakage assertion  : PASSED")
print("  Polarity spot-check: RUN (visual confirmation needed by native speaker)")
print()
print("NEXT STEPS:")
print("  P2 → Open Notebook 2, load train.csv + val.csv from Drive:")
print(f"        train = pd.read_csv('{train_path}')")
print(f"        val   = pd.read_csv('{val_path}')")
print()
print("  P3 → Build Gradio skeleton against fake classifier (can start now)")
print()
print("  P4 → Paper stats to use for Methodology / Dataset section:")
print(f"        Total training examples: {len(train_df):,}")
print(f"        Languages: Hindi, Kannada (native), Marathi, Bengali")
print(f"        Bengali class ratio: ~2:1 (requires class-weighted loss)")
