# FairMod — Project Master Context & Methodology Document

**Version:** 1.0
**Prepared:** 26 October 2026
**Status:** Active — Day 1, Step 3 in progress
**Purpose:** Single source of truth. Any team member can paste this into a fresh Claude conversation (together with the handover prompt in §9) and continue the project without loss of context.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete Context & Decision Log](#2-complete-context--decision-log)
3. [Methodology](#3-methodology)
4. [Data & Datasets](#4-data--datasets)
5. [Technical Implementation](#5-technical-implementation)
6. [Build Roadmap (72 Hours)](#6-build-roadmap-72-hours)
7. [Current Progress, Blockers & Next Steps](#7-current-progress-blockers--next-steps)
8. [Team Operating Instructions](#8-team-operating-instructions)
9. [Claude Handover Prompt](#9-claude-handover-prompt)
10. [References & Appendices](#10-references--appendices)
11. [Audit: Gaps, Conflicts & Undocumented Items](#11-audit-gaps-conflicts--undocumented-items)
12. [Change Log](#12-change-log)

### Status legend used throughout

| Tag | Meaning |
|---|---|
| ✅ **CONFIRMED** | Decided and agreed. Do not change without team consensus + change-log entry. |
| 🟡 **PROPOSED** | Recommended but not yet acted on. |
| 🔵 **ASSUMPTION** | Working assumption, not verified. |
| ❓ **UNKNOWN** | Not established in any discussion. Must not be invented. |
| ⬜ **PENDING** | Task not yet started or completed. |

---

## 1. Project Overview

### 1.1 Title

✅ **CONFIRMED** — *FairMod: An Explainable Hate-Speech Moderation Pipeline for Underserved Indian Languages*

(Working title. Original synopsis title was broader in scope; the Indian-languages narrowing is a confirmed scope change — see §2.2.)

### 1.2 Problem statement

Automated hate-speech moderation is mature for English and effectively absent for most Indian languages. Smaller organisations moderating Indic-language content have no affordable tooling, and the tools that do exist are black boxes — a moderator is told *that* a comment was flagged but not *why*, which makes the decision unauditable and untrustworthy.

### 1.3 Objectives

Derived from the original synopsis, preserved through all scope changes:

| # | Objective | Status |
|---|---|---|
| O1 | Detect abusive content across multiple underserved Indian languages using a single multilingual model | ✅ CONFIRMED |
| O2 | Provide word-level explanations for every decision, fast enough to run in real time | ✅ CONFIRMED |
| O3 | Quantify cross-lingual transfer: how much target-language data a new language actually needs | ✅ CONFIRMED — this is the primary research contribution |
| O4 | Package the system so a non-ML organisation can run it on commodity hardware | ✅ CONFIRMED (reframed — see §2.3) |
| O5 | Evaluate all of the above empirically and publish as an IEEE-format paper | ✅ CONFIRMED |

### 1.4 Scope

**In scope:** binary abusive/normal classification; 4 Indian languages; one multilingual model; gradient-based explanations; a public web demo; an IEEE paper.

**Explicitly out of scope** (all ✅ CONFIRMED cuts, see §2.3): 3-class classification, Docker, a React frontend, SHAP, a full-scale usability study, non-Indian languages, any language requiring author-request data access.

### 1.5 Expected outputs / deliverables

| # | Deliverable | Owner | Status |
|---|---|---|---|
| D1 | GitHub repo: 3 Colab notebooks + `app.py` + `requirements.txt` + README | All | ⬜ PENDING |
| D2 | Fine-tuned MuRIL checkpoint (Drive or HF Hub) | P2 | ⬜ PENDING |
| D3 | Results tables ×4 (baseline comparison, transfer curve, explainer benchmark, pilot study) | P2/P3 | ⬜ PENDING |
| D4 | IEEE-format paper | P4 | ⬜ PENDING |
| D5 | Live public demo on HuggingFace Spaces | P3 | ⬜ PENDING |
| D6 | 3-minute demo video | P3 | ⬜ PENDING |

### 1.6 Success criteria

1. ✅ Fine-tuned model beats the TF-IDF baseline on macro-F1 in every language.
2. ✅ A transfer curve exists showing F1 against number of target-language examples.
3. ✅ Integrated Gradients latency is demonstrably lower than LIME, with agreement measured, not assumed.
4. ✅ The demo loads from a public URL and returns a highlighted result.
5. ✅ The paper contains an honest Limitations section naming every scope cut.

**Explicit non-goal:** state-of-the-art accuracy. The novelty claim is *integration* (detection + explanation + deployable artifact + transfer study), not leaderboard performance. Do not spend time chasing F1 points.

---

## 2. Complete Context & Decision Log

### 2.1 Hard constraints

| Constraint | Value | Status |
|---|---|---|
| Team size | 4 people | ✅ CONFIRMED |
| Timeline | 3 days / 72 hours | ✅ CONFIRMED |
| Compute | Google Colab only, likely T4 GPU. No dedicated GPU machine. | ✅ CONFIRMED |
| Budget | ~$10 (Colab Pro). No other spend. | 🟡 PROPOSED — purchase unconfirmed |
| Skill level | Beginner to intermediate. Most ML terminology is new. | ✅ CONFIRMED |
| IEEE paper | Major graded deliverable; one team member (P4) owns documentation | ✅ CONFIRMED |
| Live demo | Part of evaluation, alongside the paper | ✅ CONFIRMED |
| REST API | Preferred but not required by rubric | ✅ CONFIRMED |
| Native speaker | At least one team member reads a target Indic language | ✅ CONFIRMED (which language: ❓ UNKNOWN) |

### 2.2 Scope changes from the original synopsis

The synopsis (`NLP_FairMod_Project_Synopsis.docx`) was written for a semester-length project with global scope. It remains the conceptual source of truth for *objectives*; the items below are confirmed deviations in *implementation*.

| Synopsis said | Now | Rationale |
|---|---|---|
| Global underserved languages (Assamese, Bodo, Albanian, Amharic, Swahili, Roman Urdu) | Indian languages only | ✅ CONFIRMED scope change by the team |
| 4–6 languages | 4 languages | Synopsis range permits it; data wrangling is the binding cost |
| Semester timeline | 72 hours | ✅ CONFIRMED |

### 2.3 Confirmed cuts, and how each is justified in the paper

| Cut | Replacement | What to write in the paper |
|---|---|---|
| REST API as separate service | Gradio mounted inside FastAPI, one file | "The demonstrator exposes a programmatic endpoint." |
| Docker | Colab notebooks + `requirements.txt` + HF Spaces | Reframe deployability as *"runs on free-tier commodity CPU hardware"* — which is actually proven, unlike an untested image |
| React dashboard | Gradio (`gr.HighlightedText`) | Zero functional loss; React build steps are the most common place student projects lose days |
| 3-class (hate/offensive/normal) | Binary (abusive/normal) | Source datasets use incompatible schemas; 3-class harmonisation costs ~6 hours. Declare as a scope decision in Methodology. |
| SHAP | Dropped entirely | LIME alone suffices as the perturbation reference |
| Full usability study | Pilot, n=6 | Call it a *pilot* consistently. Reviewers accept pilots; they reject inflated ones. |
| Assamese / Bodo | Dropped | Author-request-only data access. **Bodo was the strongest novelty hook and its loss should be named explicitly as future work.** |

⚠️ **Docker exception:** build it *only* if a teammate already has Docker Desktop installed and has 2 spare hours on Day 3. It cannot be built or tested from Colab. An untested Dockerfile is worse than none — write "containerization is straightforward future work" instead.

### 2.4 Key technical decisions and their rationale

| Decision | Choice | Rationale |
|---|---|---|
| Classifier strategy | **One multilingual model on pooled data** | Alternatives rejected: per-language models (6 artifacts, unservable from one container, no transfer story); translate-to-English (costs money, breaks on code-mixed slang — exactly the hard cases); LLM prompting (not self-hostable, explanations unverifiable, destroys the research contribution) |
| Backbone | **`google/muril-base-cased`** | Pretrained on 17 Indian languages *plus* transliterated forms. Ghosh et al. 2022 found MuRIL beats XLM-R on Hindi and Bengali. Base, not large — fits a T4. |
| Comparison model | `xlm-roberta-base`, one run | Turns an arbitrary architecture choice into a citable finding for ~40 min of GPU time |
| Live explainer | **Integrated Gradients** (Captum, `n_steps=32`) | ~20–50 passes → tens of ms. KernelSHAP needs thousands of passes (10–60s/comment) — unusable live and would fail the demo |
| Reference explainer | **LIME** (`num_samples=500`), offline, ~150 items | Gold-standard perturbation method to measure IG against |
| Frontend | Gradio inside FastAPI | One process, one file, both deliverables |
| Deployment | **HuggingFace Spaces, CPU Basic (free)** | Permanent public URL. Colab share links cold-start slowly, expire in 72h, and die on disconnect. Also *is* the deployment evidence. |

### 2.5 Critical lesson: the explainer choice IS the contribution

An alternative plan considered during discussion proposed using SHAP because it "works out of the box, even if slightly slower." **This was rejected.** That choice silently deletes objectives O2 and O4 — the paper's claim is *real-time, low-overhead explainability*, and the fast-vs-slow trade-off measurement is the finding itself. Any future suggestion to "just use SHAP" must be re-checked against this decision.

### 2.6 Other lessons established

- **Never assume label polarity.** Verified during Step 3: MACD uses `0 = abusive`. See §4.3.
- **Deduplicate across sources.** Indic hate-speech datasets overlap. A duplicate spanning train and test silently inflates every reported number.
- **Build an end-to-end chain on Day 1**, however crude, then improve each link. Teams that integrate on Day 3 don't finish.
- **P4 must have real numbers on night one.** The baseline (Step 4) exists partly to make this possible.
- **Hard stop at hour 5 on Day 1 for data acquisition.** Anything unresolved goes to Limitations.

---

## 3. Methodology

### 3.1 End-to-end pipeline

```
Raw datasets (4 sources, 3 schemas)
        ↓  [Notebook 1]  harmonise labels → dedupe → stratified split → freeze test set
Unified corpus: text, label, language, source
        ↓  [Notebook 2]  TF-IDF + LogReg baseline
        ↓  [Notebook 2]  fine-tune MuRIL (pooled, binary head)
        ↓  [Notebook 2]  transfer experiments (5 runs)
Trained checkpoint + results tables
        ↓  [Notebook 3]  Integrated Gradients + LIME benchmark
Explanation layer
        ↓  [app.py]      FastAPI + Gradio
        ↓               deploy to HF Spaces
Live demo  →  pilot study  →  error analysis  →  IEEE paper
```

### 3.2 Label harmonisation rule

✅ **CONFIRMED** — binary target schema:

- `1` = **abusive** (any of: hate, offensive, profane, HOF)
- `0` = **normal** (any of: not, NOT, non-abusive, clean)

All non-normal source labels collapse to `1`. Every mapping decision must be recorded in Notebook 1 as a comment and reproduced in the paper's Methodology section.

### 3.3 Splitting protocol

✅ **CONFIRMED**

1. Deduplicate by hash of lowercased, whitespace-normalised text — **across all sources combined**, not per file.
2. Stratify by **language × label**.
3. Split 80 / 10 / 20 → **80 / 10 / 10** (train / validation / test).
4. Write the test set to disk once and never regenerate it.
5. Assert zero text-hash overlap between train and test. This assertion is mandatory and must run in Notebook 1.

🟡 **PROPOSED alternative:** MACD and MahaHate ship with their own train/val/test splits. Using the publisher's splits is more reproducible and more citable than re-splitting. **Decide this at Step 3b and record the decision here.** Do not mix approaches across languages.

### 3.4 Experimental design

#### Experiment A — main classification result
Train one MuRIL model on the pooled multilingual training set. Report per-language macro-F1 against:
- TF-IDF + Logistic Regression baseline (per language)
- `xlm-roberta-base`, identical data and hyperparameters

→ **Table I** of the paper.

#### Experiment B — cross-lingual transfer (the core contribution)
Pick **one** target language (the one with least data, or the native speaker's language). Run five conditions:

| Condition | Training data |
|---|---|
| B1 Zero-shot | All languages **except** the target |
| B2 Few-shot (100) | B1 + 100 target examples |
| B3 Few-shot (500) | B1 + 500 target examples |
| B4 Few-shot (2000) | B1 + 2000 target examples |
| B5 Monolingual | Target language only |

Plot F1 against N. → **Figure 2.** The finding ("~N labelled examples reaches X% of full performance") is directly actionable for an NGO and is stated nowhere in the existing literature survey.

Estimated cost: ~2.5 hours of T4 time, mostly unattended.

#### Experiment C — explainer benchmark
On ~150 held-out items, measure:

| Metric | Definition |
|---|---|
| **Latency** | ms per item, measured separately on **GPU and CPU**. The CPU column is the realistic NGO deployment scenario. |
| **Agreement** | Top-5 word overlap between IG and LIME |
| **Comprehensiveness** | Confidence drop when the top-k attributed words are deleted |
| **Sufficiency** | Confidence retained when *only* the top-k words are kept |
| **Human agreement** | 🟡 PROPOSED — overlap with HateXplain human rationales, if HateXplain is included |

🔵 **ASSUMPTION:** IG–LIME agreement is expected around **60–80%**, not >90%. Report whatever is measured. An honest modest number is a better paper than an inflated one.

#### Experiment D — real-world validation
~60 real comments scraped from a public forum in the native speaker's language, hand-labelled by that speaker. Report alongside the clean benchmark. This is the single highest-credibility table in the paper.

#### Experiment E — pilot usability study
n = 6 classmates (ideally ≥2 who read a target language), 10 comments each, 5 with highlights shown and 5 without. Measure: seconds per decision, agreement with gold labels, and a 3-question survey (trust / usefulness / clarity, 1–5). Report as a **pilot** with n stated and limitations named.

❓ **UNKNOWN:** whether the institution requires ethics approval for human-subject studies. **Check this immediately.** Brief participants that they will see hateful content and may stop at any time. Rotate team members through error-analysis work for the same reason.

---

## 4. Data & Datasets

### 4.1 Acquired datasets

✅ **CONFIRMED — all four downloaded and schema-verified on 26 Oct 2026.**

| Source | Languages | Files | Rows |
|---|---|---|---|
| **MACD** (ShareChat, NeurIPS 2022) | Hindi, Tamil, Telugu, Kannada, Malayalam | `{lang}_train.csv`, `{lang}_val.csv`, `{lang}_test.csv` | ~150K total |
| **MahaHate binary** (L3Cube) | Marathi | `hate_bin_train.xlsx`, `hate_bin_valid.xlsx`, `hate_bin_test.xlsx` | 37,500 |
| **Bengali Hate Speech** (Karim et al., via Kaggle) | Bengali | `Bengali_hate_speech_.csv` | 30,000 |
| **Dravidian code-mixed** | Tamil, Malayalam, Kannada (Roman script) | ❓ **NOT PRESENT** in the shared folder | ❓ |

⚠️ **Discrepancy:** the Dravidian code-mixed set was reported as downloaded but no corresponding file appears in the project folder. Either locate it or mark it as unused. **Do not assume it is available.**

### 4.2 Verified schemas

| File pattern | Columns | Label values | Format |
|---|---|---|---|
| `{lang}_train/val/test.csv` (MACD) | `label` (int), `text` (str) | `0`, `1` | UTF-8 CSV |
| `hate_bin_*.xlsx` (MahaHate) | `text` (str), `label` (str) | `HOF`, `NOT` | Excel |
| `Bengali_hate_speech_.csv` | `sentence` (str), `hate` (int), `category` (str) | `0`, `1` | UTF-8 CSV |

**Bengali `category` values** (7, topical — not labels): crime (4,763), entertainment (4,527), sports (4,406), religion (4,370), Meme/TikTok/others (4,236), politics (3,987), celebrity (3,711). Carry as metadata; it enables a per-topic breakdown if time allows.

### 4.3 ⚠️ LABEL POLARITY — READ BEFORE WRITING ANY MAPPING CODE

✅ **CONFIRMED by direct inspection of the files, 26 Oct 2026.** This differs between sources and getting it wrong corrupts every result silently.

| Source | Raw label | Meaning | → FairMod label |
|---|---|---|---|
| **MACD** | `0` | **ABUSIVE** ⚠️ **INVERTED** | `1` |
| **MACD** | `1` | **NON-ABUSIVE** ⚠️ **INVERTED** | `0` |
| **MahaHate** | `HOF` | Hate/offensive | `1` |
| **MahaHate** | `NOT` | Normal | `0` |
| **Bengali** | `1` | Hate | `1` |
| **Bengali** | `0` | Not hate | `0` |

**Evidence for the MACD inversion:** manual inspection of 12 short Hindi samples per label class. Items labelled `0` were consistently direct insults and profanity; items labelled `1` were consistently benign conversational comments. This is corroborated by published descriptions of MACD annotating 0 for abusive and 1 for non-abusive.

**Mandatory verification step:** after writing the mapping, print 5 rows from each source where `fairmod_label == 1` and confirm by eye (or via the native speaker) that they are abusive. Do this before training anything.

### 4.4 Class balance (training splits, raw labels)

| Language | File | Rows | Label 0 | Label 1 | Balance |
|---|---|---|---|---|---|
| Hindi | `hindi_train.csv` | 20,183 | 10,527 | 9,656 | ~52/48 |
| Tamil | `tamil_train.csv` | 18,000 | 8,302 | 9,698 | ~46/54 |
| Telugu | `telugu_train.csv` | 18,000 | 9,310 | 8,690 | ~52/48 |
| Kannada | `kannada_train.csv` | 19,761 | 9,567 | 10,194 | ~48/52 |
| Malayalam | `malyalam_train.csv` | 15,508 | 6,983 | 8,525 | ~45/55 |
| Marathi | `hate_bin_train.xlsx` | 30,000 | 15,000 (NOT) | 15,000 (HOF) | 50/50 |
| Bengali | `Bengali_hate_speech_.csv` | 30,000 | 20,000 | 10,000 | 67/33 |

**Implication:** MACD and MahaHate are near-balanced; **Bengali is 2:1 skewed**. Class-weighted loss is therefore still required, and **macro-F1 must be the selection metric — never accuracy.**

Note the filename typo `malyalam_*` (not `malayalam`). Keep it as-is in code; do not rename files mid-project.

### 4.5 Language selection

🟡 **PROPOSED — not yet finalised.** Seven languages are available; four must be chosen.

Recommended roles:

| Role | Language | Why |
|---|---|---|
| High-resource Indic **source** | **Hindi** | Hindi is *not* underserved; it is the donor language in the transfer narrative |
| Underserved target 1 | **Marathi** | Clean pre-split binary data, 37.5K |
| Underserved target 2 | **Bengali** | Different script family, 30K, adds script diversity |
| Underserved target 3 | **One Dravidian language** — Tamil, Telugu, Kannada or Malayalam | ⚠️ **Must be the native speaker's language** |

❓ **BLOCKING UNKNOWN:** which language the native speaker reads. This determines target 3, and it determines which language gets the error analysis (§3.4 D) — the part of the paper a model-only team cannot write.

### 4.6 Folder structure

✅ **CONFIRMED** — all raw data lives in Google Drive, not Colab local disk, because Colab wipes local storage on disconnect.

```
MyDrive/fairmod/
├── raw/                     # original downloads, never modified
│   ├── hindi_train.csv ...
│   ├── hate_bin_train.xlsx ...
│   └── Bengali_hate_speech_.csv
├── processed/
│   ├── train.csv            # text, label, language, source
│   ├── val.csv
│   └── test.csv             # FROZEN — regenerating this invalidates all results
├── checkpoints/             # model checkpoints, saved here not locally
└── results/                 # JSON/CSV outputs feeding the paper's tables
```

### 4.7 Unified schema after Notebook 1

| Column | Type | Values |
|---|---|---|
| `text` | str | Raw comment, minimally cleaned |
| `label` | int | `1` = abusive, `0` = normal |
| `language` | str | `hi`, `mr`, `bn`, `ta`/`te`/`kn`/`ml` |
| `source` | str | `macd`, `mahahate`, `bengali_hs` |

### 4.8 Data-handling rules

1. `raw/` is read-only. Never edit originals.
2. The frozen test set is never regenerated. If it must be, log it in §12 and re-run **every** experiment.
3. Deduplicate globally before splitting.
4. Minimal cleaning only: strip URLs, usernames, excess whitespace. **Do not strip emoji** — they carry signal in this domain and appear in the data.
5. Do not redistribute source datasets; link to their original repositories in the paper.
6. Hate-speech content is distressing. Rotate manual-inspection work and let anyone opt out.

---

## 5. Technical Implementation

### 5.1 Stack

| Layer | Choice | Status |
|---|---|---|
| Environment | Google Colab (T4), Colab Pro recommended | ✅ |
| Model | `google/muril-base-cased` (~236M params) | ✅ |
| Comparison | `xlm-roberta-base` | ✅ |
| Training | HuggingFace `transformers` + `Trainer` | ✅ |
| Data | `datasets`, `pandas`, `openpyxl` (for .xlsx) | ✅ |
| Baseline | `scikit-learn` (TF-IDF char n-grams + LogisticRegression) | ✅ |
| Explainer (live) | `captum` → `LayerIntegratedGradients` | ✅ |
| Explainer wrapper | `transformers-interpret` | 🟡 PROPOSED — thin Captum wrapper, handles subword→word aggregation. **Pin the version**; lightly maintained. Raw Captum is the fallback. |
| Explainer (reference) | `lime` | ✅ |
| App | `fastapi` + `gradio` (mounted), single file | ✅ |
| Deployment | HuggingFace Spaces, CPU Basic | ✅ |
| Paper | Overleaf, `IEEEtran` template | ✅ |

### 5.2 Training configuration

✅ **CONFIRMED**

| Parameter | Value | Why |
|---|---|---|
| `max_length` | `128` | Social media comments are short. **The #1 cause of OOM is leaving this at the tokenizer default.** |
| `fp16` | `True` | Roughly halves activation memory, speeds training |
| `per_device_train_batch_size` | `32` | Fits a T4 at length 128 |
| `learning_rate` | `2e-5` | Standard for BERT-family fine-tuning |
| `num_train_epochs` | `3` | 3–4 is sufficient; more overfits |
| Loss | Class-weighted cross-entropy | Bengali is 2:1 skewed |
| Checkpoint selection | **macro F1**, never accuracy | Imbalanced classes |
| `output_dir` | Google Drive path | Colab disconnects |

### 5.3 ⚠️ Out-of-memory remediation order

Do **not** reach straight for a smaller batch size.

1. Set `max_length=128, truncation=True` — this alone usually fixes it
2. Set `fp16=True`
3. `per_device_train_batch_size=16` **plus** `gradient_accumulation_steps=2`

Reasoning: dropping raw batch size to 4 or 8 without raising accumulation changes the effective batch, which invalidates the learning rate and makes results incomparable across runs. Keep the **effective** batch at 32.

### 5.4 Explainer configuration

| Parameter | Value |
|---|---|
| IG `n_steps` | `32` (drop to `16` if CPU latency on Spaces exceeds ~3s; re-measure LIME agreement if changed) |
| IG target layer | Embedding layer |
| Tokenizer | `return_offsets_mapping=True` — required for word aggregation |
| LIME `num_samples` | `500` |
| Benchmark sample | ~150 held-out items |

### 5.5 ⚠️ Highest-risk implementation detail

**Subword-to-word aggregation.** MuRIL splits Devanagari and Dravidian words aggressively. If token attributions are not correctly merged back to whole words, highlights are nonsense — and nobody notices until the demo.

**Mandatory check:** manually inspect 10 highlighted examples in a native script and confirm word boundaries are correct. This is assigned to P3, and the native speaker should verify at least 3 of them. This check is non-negotiable.

### 5.6 Application design

Single file, one process:

```python
app = FastAPI()
# POST /classify -> {label, confidence, word_scores}
# GET  /health
app = gr.mount_gradio_app(app, demo, path="/")
```

Gradio UI: text box → label + confidence → `gr.HighlightedText` with per-word intensity. Second tab: CSV upload → sortable flagged-comments table. Model loaded **once at startup**, not per request.

FastAPI's auto-generated `/docs` page is a free screenshot for the paper.

🔵 **ASSUMPTION:** MuRIL-base CPU inference is roughly 100–300 ms per comment; IG multiplies this. Measure and report both GPU and CPU.

### 5.7 Code conventions

- Three notebooks: `01_data.ipynb`, `02_train.ipynb`, `03_explain_eval.ipynb` + `app.py`
- Set `random_state` / `seed = 42` everywhere
- Every result written to `results/` as JSON or CSV — P4 writes the paper from these files, not from screenshots
- Every label-mapping decision carries an inline comment explaining it

---

## 6. Build Roadmap (72 Hours)

### Roles ✅ CONFIRMED

| Role | Owns |
|---|---|
| **P1** | Data acquisition, cleaning, splits, real-world test set |
| **P2** | Training, transfer experiments, results tables |
| **P3** | Explainability layer, app, deployment |
| **P4** | IEEE paper — **starts Hour 1, not Day 3** |

❓ **UNKNOWN:** which named team member holds which role.

### Day 1

| Step | Task | Owner | Status |
|---|---|---|---|
| 1 | Account/environment setup | All | ✅ DONE |
| 2 | Dataset acquisition & verification | P1 | ✅ DONE |
| 3a | Schema & label-polarity inspection | P1 | ✅ DONE (§4.2–4.3) |
| 3b | Notebook 1: harmonise, dedupe, split | P1 | ⬜ **NEXT** |
| 4 | TF-IDF + LogReg baseline → Table I | P2 | ⬜ |
| 5 | First MuRIL fine-tune → per-language F1 | P2 | ⬜ |
| — | Paper Sections I (Intro) + II (Related Work) | P4 | ⬜ |
| — | Gradio skeleton against a fake classifier | P3 | ⬜ |

**End-of-Day-1 target:** working model, two results tables, paper at ~40%.

### Day 2

| Step | Task | Owner |
|---|---|---|
| 6 | Transfer experiments B1–B5 (~2.5h, unattended) | P2 |
| 6b | `xlm-roberta-base` comparison run | P2 |
| 7 | IG + LIME benchmark; **word-boundary check** | P3 |
| 8 | `app.py` wired to the real model | P3 |
| 9 | ~60-comment real-world test set, hand-labelled | P1 + native speaker |
| — | Methodology section; populate tables as numbers arrive | P4 |

**End-of-Day-2 target:** all experiments done, app working, paper ~70%.

### Day 3

| Step | Task | Owner |
|---|---|---|
| 10 | Deploy to HF Spaces (~45 min) | P3 |
| 11 | Pilot usability study, n=6, run **on the deployed Space** | All |
| 12 | Error analysis: 20 misclassified examples + highlights | Native speaker |
| — | Freeze code, clean repo, README, demo video | All |
| 13 | Finish paper: Results, Discussion, Limitations, Conclusion | P4 |
| — | **Demo rehearsal, timed, on venue wifi** | All |

**Demo fallbacks — prepare all three:** Spaces URL, local copy on a laptop, recorded video. Assume one fails.

### Testing checklist (~1 hour, mandatory)

- [ ] Assert zero text-hash overlap between train and test
- [ ] Print 5 `label==1` rows per source and confirm they are abusive
- [ ] Manually inspect 10 explanation outputs for correct word boundaries
- [ ] App edge cases: empty input, 3000-character input, emoji-only, wrong-language input
- [ ] Full end-to-end run from a **fresh** Colab runtime with nothing cached

### The three documented failure modes

1. Hunting for perfect data past the hour-5 cutoff on Day 1
2. Reporting errors as summaries instead of full tracebacks (blind debugging wastes cycles)
3. Saving the paper for Day 3 — it does not fit

---

## 7. Current Progress, Blockers & Next Steps

### 7.1 Completed

- ✅ Scope finalised; all cuts agreed (§2.3)
- ✅ Methodology and experimental design fixed (§3)
- ✅ Four datasets downloaded
- ✅ All schemas verified (§4.2)
- ✅ **Label polarity resolved, including the MACD inversion** (§4.3)
- ✅ Class balance measured (§4.4)

### 7.2 Immediate next step

⬜ **Step 3b — Notebook 1.** Load all sources from `raw/`, apply the §4.3 polarity mapping, unify to the §4.7 schema, deduplicate globally, split per §3.3, write to `processed/`, and run the leakage assertion.

**Decide and record before writing it:** publisher splits vs. custom re-split (§3.3).

### 7.3 Blockers

| # | Blocker | Impact | Owner |
|---|---|---|---|
| B1 | ❓ Native speaker's language unknown | Blocks final language selection (§4.5), error analysis assignment, real-world test set | All — answer now |
| B2 | ❓ Dravidian code-mixed files missing from the shared folder | Reported as downloaded but absent | P1 |
| B3 | ⬜ Final 4-language selection not made | Blocks Notebook 1 | All |
| B4 | ❓ Ethics approval requirement for the pilot study unknown | Could block Experiment E | P4 |
| B5 | 🟡 Colab Pro not confirmed purchased | Free-tier disconnects will cost more than $10 of a 72-hour budget | All |

### 7.4 Open questions

- ❓ IEEE paper page limit
- ❓ Exact submission deadline / which calendar days map to Day 1–3
- ❓ Whether HateXplain will be included (enables human-rationale agreement, §3.4 C)
- ❓ Which teammate holds which role
- ❓ Whether anyone has Docker Desktop installed (decides the §2.3 Docker exception)

---

## 8. Team Operating Instructions

### 8.1 Consistency rules

1. **This document is the source of truth.** Where it conflicts with the original synopsis on *implementation*, this document wins. On *objectives*, the synopsis wins.
2. **Never change a ✅ CONFIRMED decision alone.** Raise it, get consensus, add a §12 entry.
3. **Never silently resolve a contradiction.** Flag it.
4. **Never invent a value.** If this document says ❓ UNKNOWN, it is unknown. Find out or mark it.
5. **Seed 42 everywhere.** Results must reproduce.
6. **The frozen test set stays frozen.**

### 8.2 Validation rules

- No result enters the paper without its generating script committed
- Every model run reports **macro-F1**, per language, against the baseline
- Any claim about speed must come from a measurement, with hardware stated
- The label-polarity spot-check (§4.3) runs again any time the data pipeline changes

### 8.3 Avoiding duplicated work

- Work only within your role's steps (§6)
- P3 works against a fake classifier until P2's model exists — never wait idle
- P4 writes continuously from `results/` files
- Announce in the team channel when you start a step and when you finish it

### 8.4 Working with Claude

The established loop: **Claude writes code → you run it in Colab → you paste back the full output or the complete error → Claude fixes.**

Rules that keep this fast:
1. Paste the **entire** traceback, from `Traceback` to the last line — never a summary
2. Paste **full printed output**, including all numbers; the paper is written from these
3. One problem per message
4. Say "explain that" whenever a term is unfamiliar — asking costs 30 seconds, a misunderstanding costs an hour
5. Open with "I'm at Step N" so Claude knows the position

### 8.5 Change management

Any change to a confirmed decision requires: what changed, why, who approved, what it invalidates, and a §12 entry with the date.

---

## 9. Claude Handover Prompt

> Copy everything below into a new Claude conversation, with this document attached.

```
I am working on a team project called FairMod. The attached document
(FairMod_Master_Context.md) is our single source of truth. Read it fully
before responding to anything.

Your role: act as our practical technical mentor and coding copilot. I am a
beginner — most ML terminology is new to me. Write the code; I run it in
Google Colab and report results back to you.

Rules you must follow:

1. The attached document governs. Do not contradict a decision marked
   CONFIRMED. If you think one is wrong, say so explicitly and explain why,
   but do not quietly substitute your own approach.
2. Respect the status tags. CONFIRMED is settled. PROPOSED is not yet
   decided. ASSUMPTION is unverified. UNKNOWN means it was never
   established — ask me, never invent it.
3. Flag conflicts. If my request contradicts the document, stop and tell me
   which section it conflicts with before proceeding.
4. Constraints are hard: 4 people, 72 hours, Google Colab T4 only, ~$10
   budget, beginner skill level. An IEEE paper and a live demo are both
   graded deliverables.
5. Do not add scope. No new features, frameworks, or infrastructure beyond
   what Section 5 lists. Section 2.3 lists things we deliberately cut — do
   not reintroduce them.
6. Explain terminology briefly the first time it appears.
7. Give me actionable steps: what to paste where, what output to expect,
   and what to report back.
8. Section 4.3 contains verified label polarity. MACD uses 0 = ABUSIVE
   (inverted). Never assume label meaning; always honour that table.
9. Section 7 is the current state. Start from the next step listed there.

Tell me which step you believe we are on, confirm you have read the
document, and then proceed.
```

---

## 10. References & Appendices

### 10.1 Glossary

| Term | Plain-language meaning |
|---|---|
| **Fine-tuning** | Taking a model already trained on billions of words and nudging it toward your task with a small dataset. You never train from scratch. |
| **MuRIL** | Google's free pretrained model covering 17 Indian languages plus their romanised forms. Our starting point. |
| **Colab notebook** | A webpage where Python runs in chunks called cells. Free GPU. Press ▶ to run. |
| **F1 score** | One number from 0 to 1 for classifier quality. Higher is better. ~0.75+ is respectable here. **Macro** F1 averages across classes, which matters when classes are imbalanced. |
| **Integrated Gradients** | Fast method identifying which words drove a decision. Produces the highlighting. |
| **LIME** | Slower method that repeatedly perturbs the input to see what matters. Our reference standard. |
| **Zero-shot** | Testing on a language the model saw no training data for. |
| **Few-shot** | Same, but with a handful of examples added. |
| **Comprehensiveness** | Confidence drop when the top attributed words are removed — a faithfulness measure. |
| **Code-mixed** | Text switching between languages, often an Indian language written in Roman script. |

### 10.2 Verification snippets

**Schema and label distribution check:**
```python
import pandas as pd
df = pd.read_csv(path)                 # pd.read_excel for .xlsx
print("ROWS:", len(df), "COLUMNS:", list(df.columns))
for c in df.columns:
    if df[c].nunique() <= 10:
        print(f"  {c}: {df[c].value_counts().to_dict()}")
print(df.head(6).to_string())
```

**Mount Drive:**
```python
from google.colab import drive
drive.mount('/content/drive')
BASE = '/content/drive/MyDrive/fairmod'
```

**Polarity spot-check (run after mapping, before training):**
```python
for src in unified['source'].unique():
    print("===", src, "— rows mapped as ABUSIVE ===")
    print(unified[(unified.source==src) & (unified.label==1)]['text'].head(5).to_string())
```

**Leakage assertion (mandatory in Notebook 1):**
```python
import hashlib
h = lambda s: hashlib.md5(" ".join(str(s).lower().split()).encode()).hexdigest()
train_h = set(train.text.map(h)); test_h = set(test.text.map(h))
assert not (train_h & test_h), f"LEAKAGE: {len(train_h & test_h)} overlapping items"
```

### 10.3 Key literature

| Work | Relevance |
|---|---|
| Gupta et al., *Multilingual Abusive Comment Detection at Scale for Indic Languages*, NeurIPS 2022 | MACD source paper — 150K, 5 Indic languages, balanced. **Cite for the dataset.** |
| Das, Banerjee & Mukherjee, *Data Bootstrapping Approaches to Improve Low Resource Abusive Language Detection for Indic Languages*, ACM HT 2022 | 8 Indic languages harmonised to binary; MuRIL outperforms mBERT on Indian languages. Supports the backbone choice. |
| Velankar et al., *L3Cube-MahaHate*, TRAC@COLING 2022 | MahaHate source paper — 25K 4-class / 37.5K binary Marathi. **Cite for the dataset.** |
| Romim et al. / Karim et al., Bengali Hate Speech | 30K Bengali comments from YouTube and Facebook, 50 annotators. **Cite for the dataset.** |
| Mathew et al., *HateXplain* | Human word-level rationales — the only true ground truth for explanation quality |
| Original synopsis (`NLP_FairMod_Project_Synopsis.docx`) | 15-paper literature review. **Source of truth for objectives.** Feeds paper Section II. |

### 10.4 External resources

- MACD: `github.com/ShareChatAI/MACD`
- MahaHate: `github.com/l3cube-pune/MarathiNLP` (data is on GitHub; `l3cube-pune` HF links are **models**, not datasets)
- Bengali: `github.com/rezacsedu/Bengali-Hate-Speech-Dataset`
- IndicAbusive: `github.com/hate-alert/IndicAbusive`
- India hate speech superset: `huggingface.co/datasets/manueltonneau/india-hate-speech-superset`
- MuRIL: `huggingface.co/google/muril-base-cased`

### 10.5 Datasets investigated and rejected

| Dataset | Why rejected |
|---|---|
| HASOC Hindi/Marathi | Registration form required; cannot wait on email in 72 hours |
| Assamese / Bodo (Ghosh et al.) | Author-request only |
| Hindi-English code-mixed (HECM, Bohra et al.) | Author-request only |
| Albanian, Amharic, Swahili, Roman Urdu | Out of scope after the India narrowing |

---

## 11. Audit: Gaps, Conflicts & Undocumented Items

Performed against the full conversation history on 26 Oct 2026.

### 11.1 Unresolved conflicts

| # | Conflict | Resolution needed |
|---|---|---|
| C1 | Dravidian code-mixed reported as downloaded but absent from the shared folder | P1 to locate or formally drop |
| C2 | §3.3 custom splitting vs. the publisher splits that MACD and MahaHate already ship | Decide at Step 3b; apply one approach uniformly |
| C3 | Synopsis specifies 3-class; project uses binary | **Resolved** as a confirmed cut (§2.3), but must appear in the paper's Limitations |
| C4 | Synopsis specifies Docker + React; both cut | **Resolved** (§2.3); Docker is conditionally revivable |

### 11.2 Documented unknowns

B1–B5 and the §7.4 open questions. **B1 (native speaker's language) is the most urgent** — it blocks language selection, which blocks Notebook 1, which blocks everything.

### 11.3 Undocumented dependencies

- Exact package versions are unpinned. Pin `transformers-interpret` at minimum.
- HuggingFace Spaces CPU latency is estimated, not measured.
- The pilot study's 6 participants are not yet recruited.
- No public-forum source is identified for the 60-comment real-world test set.
- Team member names are not mapped to roles P1–P4.

### 11.4 Context limitations of this document

- The original synopsis's full 15-paper reference list is **not reproduced here**; it exists only in `NLP_FairMod_Project_Synopsis.docx`, which P4 must consult directly for paper Section II.
- Exact numeric claims from the synopsis (stated targets, prior-work metrics) are not reproduced.
- Any team discussion held outside the Claude conversation is not captured.

---

## 12. Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-10-26 | Claude + project lead | Initial consolidation of all project context, decisions, and methodology. Includes verified dataset schemas, confirmed MACD label inversion, class-balance measurements, and the full 72-hour roadmap. |
| 1.1 | 2026-10-28 | P2 + Claude | Step 4 done: TF-IDF baseline test macro-F1 hi 0.837 / kn 0.844 / mr 0.892 / bn 0.886 (`results/baseline_results.json`). `02_train.py` added for Steps 4–6b. New decisions (no confirmed decision changed): transfer target = Kannada; few-shot sets nested and stratified by source×label; B1–B4 checkpoint selection on non-target val only, so the target never leaks via selection. Warmup = 10% of steps (not specified in §5.2). |
| 1.2 | 2026-10-28 | P3 + Claude | P3 code added: `fairmod_explain.py`, `03_explain_eval.py`, `app.py`, `test_app.py`, Spaces files. Decisions: raw Captum, not `transformers-interpret` (resolves the §5.1 PROPOSED item, removes an unmaintained dependency). Explainer code lives in one shared module imported by both the notebook and the app, so the benchmark measures the deployed code (the app is still one process, §5.6). Words = whitespace tokens, not regex `\w`, because Indic matras count as non-word characters. Benchmark: 152 test items (19 per language × label), k = top 20% of words, random-word reference. Model reaches the Space via a private HF Hub repo (`MODEL_ID` + `HF_TOKEN`). Finding: MuRIL maps every emoji to `[UNK]`. |

### Entry template

```
| 1.x | YYYY-MM-DD | <name> | <what changed, why, what it invalidates> |
```

---

*End of document. Next action: resolve blocker B1 (native speaker's language), finalise the 4 languages, then build Notebook 1.*
