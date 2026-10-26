# FairMod: Hate-Speech Moderation for Underserved Indian Languages

A 72-hour student project building an explainable hate-speech detection pipeline
for Hindi, Kannada, Marathi, and Bengali -- languages with little to no existing
moderation tooling.

**Repository:** https://github.com/samyakbtech24/NLP-moderation--underserved-languages
**Project status:** Day 1 complete. Data preparation pipeline built and verified.
**Paper format:** IEEE conference paper
**Demo target:** HuggingFace Spaces (live public URL)

---

## What This Project Does

Most hate-speech detection tools work only for English. This project builds one
that works for four Indian languages simultaneously, using a single multilingual
model (MuRIL, built by Google for Indian languages).

Beyond detection, the system also explains its decisions: it highlights the
specific words that caused a comment to be flagged. This makes the system
auditable and trustworthy for real-world use.

The research question being answered: how much training data in a new language
does the model actually need before it performs well? This has direct value for
small organisations moderating Indic-language content.

---

## Repository Structure

```
NLP-moderation--underserved-languages/
|
|-- 01_data_preparation.py      <- Step 3b. Run this in Google Colab first.
|-- FairMod_Master_Context.md   <- Single source of truth for all project decisions.
|-- README.md                   <- This file.
|-- TEAM_ROLES.md               <- Who does what, and in what order.
|-- datasets/
|   |-- MACD-main/              <- Hindi, Kannada and more (ShareChat / NeurIPS 2022)
|   |-- l3-Cube-MahaHate/       <- Marathi binary hate speech (L3Cube)
|   |-- Bengali hate speech/    <- Bengali hate speech (Karim et al.)
|   |-- DravidianCodeMix/       <- Kannada code-mixed in Roman script
```

Notebooks to be added as work progresses:
- `02_train.ipynb`        -- TF-IDF baseline + MuRIL fine-tuning (P2)
- `03_explain_eval.ipynb` -- Integrated Gradients + LIME benchmark (P3)
- `app.py`                -- FastAPI + Gradio demo (P3)

---

## What Was Completed on Day 1

### Datasets downloaded and verified

| Dataset | Languages | Rows | Location |
|---|---|---|---|
| MACD (ShareChat, NeurIPS 2022) | Hindi, Kannada and others | ~150,000 | datasets/MACD-main/ |
| MahaHate Binary (L3Cube) | Marathi | 37,500 | datasets/l3-Cube-MahaHate/2-class/ |
| Bengali Hate Speech (Karim et al.) | Bengali | 30,000 | datasets/Bengali hate speech/ |
| DravidianCodeMix | Kannada (Roman script) | ~7,000 | datasets/DravidianCodeMix/ |

### Languages selected (locked)

| Language | Source | Role |
|---|---|---|
| Hindi | MACD | High-resource donor language in the transfer study |
| Kannada | MACD + DravidianCodeMix | Native speaker language; used for error analysis |
| Marathi | MahaHate | Underserved target language 1 |
| Bengali | Bengali Hate Speech | Underserved target language 2 |

### Critical label issue found and fixed

The MACD dataset uses an inverted labelling convention. Raw label 0 means abusive,
raw label 1 means normal. This is the opposite of the standard convention. It was
confirmed by manually reading 12 Hindi samples per class, and the fix is built
into 01_data_preparation.py. If this inversion is not applied correctly, the model
learns to approve hate speech. All results would be silently wrong.

### Splitting strategy decided

MACD, MahaHate, and DravidianCodeMix use their own publisher train/val/test splits.
Bengali has no official split; a stratified 80/10/10 split is applied with seed 42.

### Data preparation notebook built

01_data_preparation.py contains 17 cells for Google Colab. It handles loading,
label correction, column standardisation, deduplication, leakage checking, and
saving the final train/val/test CSVs to Google Drive.

---

## What Needs to Happen Next

### Immediate: Run the data pipeline (P1)

Open 01_data_preparation.py in Google Colab. Run all 17 cells in order. When
Cell 14 prints rows labelled as abusive, the native Kannada speaker must confirm
they actually look offensive. This is mandatory. After running, paste the output
of Cell 17 into the team chat for the record.

### Step 4: TF-IDF baseline (P2)

After 01_data_preparation.py completes, load the output train.csv and val.csv
from Google Drive. Train a TF-IDF + Logistic Regression model per language.
Report macro-F1 for each language. Save to results/baseline_results.json.
These numbers are Column 1 of Table I in the paper.

### Step 5: MuRIL fine-tuning (P2)

Fine-tune google/muril-base-cased on the pooled multilingual training set.
Exact training settings are in FairMod_Master_Context.md Section 5.2.
Use class-weighted loss (Bengali is 2:1 imbalanced). Save the checkpoint to Drive.

### P3: Gradio interface skeleton (can start now, in parallel)

Build a minimal Gradio interface with a text box and a fake classifier returning
random results. Wire it to the real model on Day 2 when P2 has a checkpoint.

### P4: Write the paper now (not on Day 3)

Open Overleaf with the IEEEtran template. Write Section I and Section II today
using the master context and the original synopsis. Leave placeholders for tables.
Target: paper is 40 percent done by end of Day 1.

---

## Rules Every Team Member Must Follow

- Use macro-F1 as the evaluation metric. Not accuracy. Bengali class imbalance
  makes accuracy meaningless here.
- Do not retrain on different label mappings without re-reading Section 4.3 of
  the master context (the MACD inversion).
- Do not regenerate the test set after it is frozen. Log any regeneration in the
  Change Log (master context Section 12) and re-run all experiments.
- Do not add tools or frameworks not listed in master context Section 5. Docker,
  React, and SHAP were deliberately removed from scope.
- Save all numbers to JSON or CSV files in results/. P4 writes from those files.
- Paste full error tracebacks, not summaries.
- Seed 42 everywhere.

---

## How to Continue with AI Assistance

To start a fresh Claude session with full project context, paste this prompt and
attach FairMod_Master_Context.md:

    I am working on a team project called FairMod. The attached document
    (FairMod_Master_Context.md) is our single source of truth. Read it fully
    before responding. Your role is to act as our practical technical mentor.
    I am a beginner. Write the code; I run it in Google Colab and report results
    back to you. Tell me which step you believe we are on and proceed.

This prompt is also in the master context, Section 9.

---

## References

| Dataset | Citation | Link |
|---|---|---|
| MACD | Gupta et al., NeurIPS 2022 | github.com/ShareChatAI/MACD |
| MahaHate | Velankar et al., TRAC@COLING 2022 | github.com/l3cube-pune/MarathiNLP |
| Bengali Hate Speech | Karim et al. | github.com/rezacsedu/Bengali-Hate-Speech-Dataset |
| MuRIL | Google | huggingface.co/google/muril-base-cased |

---

*Last updated: 26 October 2026. All confirmed decisions are recorded in
FairMod_Master_Context.md. Any change to a confirmed decision requires a
Change Log entry with date, reason, and what it invalidates.*
