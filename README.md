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

P2 notebook (Colab cells, same format as Notebook 1):
- `02_train.ipynb`        -- open this in Colab (File → Upload notebook); generated from 02_train.py
- `02_train.py`           -- TF-IDF baseline, MuRIL fine-tuning, transfer B1-B5, XLM-R (P2)

P3 files:
- `fairmod_explain.py`    -- classifier + Integrated Gradients, shared by notebook 3 and the app
- `03_explain_eval.ipynb` -- open this in Colab; generated from 03_explain_eval.py
- `03_explain_eval.py`    -- IG vs LIME benchmark, word-boundary check, error-analysis export
- `app.py`                -- FastAPI + Gradio demo (one process)
- `test_app.py`           -- app edge-case tests (local or against the live Space)
- `requirements.txt`, `hf_space_README.md` -- HuggingFace Spaces deployment

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

### Step 4: TF-IDF baseline (P2) -- DONE

02_train.py Part A (Cells 1-6, no GPU). One TF-IDF char 2-5-gram + Logistic
Regression model per language, class_weight='balanced'. Results are in
results/baseline_results.json. These numbers are Column 1 of Table I:

| Language | Val macro-F1 | Test macro-F1 |
|---|---|---|
| Hindi | 0.8415 | 0.8369 |
| Kannada | 0.8515 | 0.8441 |
| -- Kannada / MACD (native script) | 0.8538 | 0.8456 |
| -- Kannada / DravidianCodeMix (Roman) | 0.7702 | 0.7817 |
| Marathi | 0.8908 | 0.8924 |
| Bengali | 0.8832 | 0.8864 |
| Overall | 0.8615 | 0.8582 |

The baseline is strong, so MuRIL has to clear about 0.84-0.89. Report the gap
honestly whatever it turns out to be (master context Section 1.6).

### Step 5: MuRIL fine-tuning (P2) -- code ready, run on Colab T4

02_train.py Part B (Cells 7-10, ~45 min). Uses the confirmed Section 5.2 settings
with class-weighted loss. It picks the best epoch by val macro-F1 and saves the
model to checkpoints/muril_pooled/final, which P3 loads.

### Step 6 / 6b: Transfer B1-B5 + XLM-R (P2) -- code ready

02_train.py Part C (Cells 11-13, ~2.5 h): the target is Kannada. Few-shot sets
are nested (100 in 500 in 2000) and stratified by source and label. B1-B4 choose
checkpoints on non-Kannada val only, so Kannada labels never leak in through model
selection. Outputs: transfer_results.json, transfer_curve.csv and .png (Figure 2).
Part D (Cells 14-16): xlm-roberta-base run, then results/table_I.csv.
Each run saves as soon as it finishes. After a Colab disconnect, re-run the setup
cells and runs that already finished are skipped.

### P3: Explainer, app, deployment -- benchmark DONE, app running locally, Space not yet deployed

**Experiment C results** (results/explainer_benchmark.json). There are 152 test
items, 19 per language x label. Hardware: Apple M3 laptop, using the "GPU" =
MPS GPU and the CPU (4 threads). A T4 GPU number would need a Colab run of the
notebook.

| Method | GPU ms | CPU ms | Comprehensiveness (higher better) | Sufficiency (lower better) |
|---|---|---|---|---|
| Integrated Gradients | 350 | 564 | 0.335 | 0.021 |
| LIME (500 samples) | 1,785 | 3,230 | 0.410 | -0.020 |
| Random words | -- | -- | 0.057 | 0.307 |

- **Speed:** IG is 5.7x faster than LIME on CPU. Prediction alone takes 30 ms on CPU.
- **Faithfulness:** both explainers are far above random. LIME is somewhat more
  faithful than IG. That is the speed/faithfulness trade-off the paper argues
  about, so report it as measured.
- **IG-LIME top-5 agreement:** 0.699 overall and 0.572 on comments with 10+ words.
  By language: kn 0.80, bn 0.69, hi 0.68, mr 0.63. This is inside the expected
  60-80% band (master context Section 3.4).
- **Word-boundary check:** 10 comments, 87 words, 0 words split incorrectly by the
  automatic check. Still pending: the native speaker's sign-off in
  word_boundary_check.csv.
- **Error-analysis input:** 1,014 Kannada test errors out of 7,170. 20 of them
  (10 false positives, 10 false negatives) are in error_analysis_kn.csv for Step 12.
- **Checkpoint check:** the local checkpoint scored test macro-F1 0.8765, against
  0.8764 in Notebook 2.

**Step 7: IG + LIME benchmark (03_explain_eval.py, Colab T4, ~25 min).**
Upload fairmod_explain.py to MyDrive/fairmod/code/ once, then run the cells in order.
- Cell 5 is the mandatory word-boundary check. The native Kannada speaker fills
  the native_speaker_ok column in results/word_boundary_check.csv. At least the
  3 Kannada-script items are required.
- Cells 6-11 produce the Experiment C table (results/explainer_benchmark.*):
  latency on GPU and CPU, IG-LIME top-5 agreement, comprehensiveness and
  sufficiency, each compared against random words.
- Cell 12 exports 20 Kannada errors with their top IG words for Step 12
  (results/error_analysis_kn.csv).

Things found while testing, worth a line in the paper:
- MuRIL has no emoji in its vocabulary. Every emoji becomes the same [UNK]
  token, so emoji are kept but carry almost no signal.
- Bengali text contains zero-width joiners (U+200C). The tokenizer drops them,
  and words are still mapped correctly.
- Words are found by splitting on whitespace, not with regex `\w`. Python treats
  Indic vowel signs as non-word characters, so `\w` would cut words in half.

**Step 8: app.py.** One FastAPI process with Gradio mounted at `/`.
`POST /classify` returns `{label, confidence, word_scores}`. `POST /bulk`
ranks many comments by abusive probability (no IG). `GET /health` is a
status check. `/docs` has the API docs (a free screenshot for the paper).
Tab 1 shows a single comment with red/blue word highlights. Tab 2 takes a CSV
upload and ranks the comments. To run locally:
`MODEL_ID=<checkpoint folder> python app.py` and open http://localhost:7860.
`python test_app.py` runs the checklist edge cases: empty input, 3000
characters, emoji only, wrong language.

**Local Next.js UI (`web/`):** polished App Router frontend that proxies to the
FastAPI backend. With the API running on :7860:

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:3000. Details in `web/README.md`.

**Moderation console (Tier 1, `moderation.py` + `web/app/console/`).** This turns the
classifier into a moderation workflow, built on what commercial tools offer (Hive's
rules engine and review queue, Azure Content Safety's blocklists, Checkstep's
statements of reasons). Open http://localhost:3000/console.

| Page | What it does |
|---|---|
| Ingest | Sends one comment, a CSV, or a 32-comment demo stream through the pipeline (`POST /mod/moderate`). |
| Policies | Threshold presets (Balanced 50/90, Strict 30/70, Lenient 70/97). Exactly one is active. Sliders show an impact preview on everything seen so far. |
| Block & allow lists | Per-language terms checked before the thresholds. They fix model misses without retraining: e.g. blocklisting ঘেন্না removes a Bengali insult the model scored 3%. |
| Review queue | Items between the two thresholds. The moderator approves, or removes with a policy category. The page shows the author's prior removals. Keys: A / R / J / K. |
| Decision log | Every item with status, the rule that fired, and an auto-generated statement of reasons from the IG words. Moderators can override. CSV export. |
| Dashboard | Volume, automation rate, flag rate per language, model–moderator agreement, median time to decision, and the words most often driving removals. |
| Audit log | Every human decision and every policy or list change, with actor and time. |

Pipeline order: classify + IG, then blocklist (always wins), then allowlist (allows if every
high-IG word is allowlisted), then the policy thresholds. Data lives in `data/fairmod.db`
(SQLite, gitignored; delete it to reset). Language is detected from the script; Hindi and
Marathi are told apart by common function words. `python test_moderation.py` runs 27
checks against a fake classifier, without the model.

**Step 10: deploy to HuggingFace Spaces (~45 min).**
1. Run 03_explain_eval.py Cell 13. It uploads the checkpoint to a private HF
   model repo, e.g. `yourname/fairmod-muril`.
2. On huggingface.co, create a new Space: SDK Gradio, hardware CPU Basic (free).
3. Upload `app.py`, `fairmod_explain.py`, `moderation.py`, `requirements.txt`, and
   `hf_space_README.md` renamed to `README.md`.
4. Go to Space settings, Variables and secrets. Add the variable
   `MODEL_ID = yourname/fairmod-muril` and the secret `HF_TOKEN = <read token>`.
5. Wait for the build, then run
   `SPACE_URL=https://<user>-<space>.hf.space python test_app.py`.
   Note the CPU latency it prints; that is the real NGO deployment number.

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
