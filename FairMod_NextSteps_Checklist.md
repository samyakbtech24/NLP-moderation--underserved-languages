# 🚀 FairMod — What We've Done & What Comes Next
### A Beginner-Friendly Checklist & Implementation Plan
> **Date:** 26 October 2026 | **Current Status:** Day 1, End of Step 3a — Moving to Step 3b

---

## 🧠 First — What is FairMod? (Quick Recap)

Think of FairMod as a **smart comment filter for Indian social media** — but with a twist.

Most filters just say *"this comment is bad"* — like a black box with no explanation.

**FairMod does two things:**
1. ✅ **Detects** hateful/abusive comments in **4 Indian languages**
2. ✅ **Explains WHY** — highlights the actual bad words (like a yellow marker on the offensive parts)

It's built to work cheaply, so small organizations (like NGOs) can actually afford to run it.

---

## ✅ PHASE 1 COMPLETE — What We Finished Today

Here's everything we accomplished today (Day 1, Steps 1–3a):

| ✅ Done | Details |
|---|---|
| 🖥️ Set up accounts & environment | Google Colab, Drive, HuggingFace accounts ready |
| 📥 Downloaded all datasets | 4 sources of hate-speech data downloaded (see below) |
| 🔍 Verified every file's structure | Checked column names, row counts, and formats |
| ⚠️ Found the label flip in MACD | MACD dataset uses 0=abusive (opposite of what you'd expect!) |
| 📊 Measured class balance | Bengali is 2:1 skewed — will need special handling during training |
| 📝 Finalized the project plan | 72-hour roadmap locked, team roles assigned (P1–P4) |

### 📁 Datasets We Now Have

| Dataset | Language(s) | Size | Where It Lives |
|---|---|---|---|
| **MACD** (ShareChat / NeurIPS 2022) | Hindi, Tamil, Telugu, Kannada, Malayalam | ~150,000 rows | `MACD-main/` folder |
| **MahaHate Binary** (L3Cube) | Marathi | 37,500 rows | `l3-Cube-MahaHate/` folder |
| **Bengali Hate Speech** (Karim et al.) | Bengali | 30,000 rows | `Bengali hate speech .csv/` folder |
| **DravidianCodeMix** | Tamil, Malayalam, Kannada (Roman script) | ❓ Present but needs checking | `DravidianCodeMix-Dataset-main/` folder |

> 💡 **Note:** The master plan said DravidianCodeMix was "missing," but the folder IS actually present on your desktop. This needs to be verified — it may have been downloaded after the plan was written.

---

## 🚨 URGENT — Answer These Questions BEFORE Writing Any Code

> These are **blockers** — without answers, we can't move forward properly.

### ❓ Question 1 (MOST URGENT): Which language does your native speaker read?

This matters because:
- We need to pick **4 languages** out of the 7 we have data for
- The native speaker will **hand-label real comments** (60 of them) for the most credible table in the paper
- They'll also **verify the explanation highlights** make sense in their language

**Available languages to choose from:** Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali

📌 **Action:** Ask every team member right now. Update this doc when known.

---

### ❓ Question 2: Should we use the datasets' original splits or make our own?

- **Option A — Use publisher's splits (Recommended):** MACD and MahaHate already come with train/validation/test files. Using theirs is more reproducible and easier to cite in the paper.
- **Option B — Custom re-split:** We combine everything and split ourselves (80/10/10).

> ⚠️ **You must pick ONE approach and apply it consistently across all datasets.** Don't mix them.

📌 **Action:** Team decides this at Step 3b start. Write the decision into the master context file.

---

### ❓ Question 3: Does your institution require ethics approval for the pilot study?

The pilot study (Experiment E) involves **6 classmates reading hateful comments**. Some universities require approval for human-subject research, even if it's minor.

📌 **Action:** P4 (paper writer) checks with the professor/department immediately.

---

## 📋 MASTER CHECKLIST — Day 1 Remaining Tasks

### 🔴 Step 3b — Build Notebook 1: Data Cleaning & Preparation
**Owner:** P1 | **Priority:** MUST finish today | **Estimated time:** ~2–3 hours

This is the most important step right now. Everything else depends on it.

**What Notebook 1 does** (think of it like a recipe):

- [ ] **Load all datasets** from their folders into Python (using pandas)
- [ ] **Fix the MACD label flip** — swap 0↔1 for MACD only (see the critical table below!)
- [ ] **Standardize labels** — everything becomes `1 = abusive`, `0 = normal`
- [ ] **Standardize column names** — everything becomes `text`, `label`, `language`, `source`
- [ ] **Remove duplicates** — check if the same comment appears in multiple datasets
- [ ] **Split data** — 80% training, 10% validation, 10% test
- [ ] **Freeze the test set** — save it to Google Drive and never touch it again
- [ ] **Run the leakage check** — prove no test data leaked into training data
- [ ] **Spot-check labels** — print 5 rows marked as "abusive" from each source and verify by eye

#### ⚠️ CRITICAL: The Label Flip Table (Don't Get This Wrong!)

| Dataset | Raw label in file | What it actually means | → FairMod label |
|---|---|---|---|
| **MACD** | `0` | **ABUSIVE** ⚠️ FLIPPED! | → `1` |
| **MACD** | `1` | **NORMAL** ⚠️ FLIPPED! | → `0` |
| **MahaHate** | `HOF` | Hate/offensive | → `1` |
| **MahaHate** | `NOT` | Normal | → `0` |
| **Bengali** | `1` | Hate | → `1` |
| **Bengali** | `0` | Not hate | → `0` |

> 💥 If you get MACD wrong, the model learns to *approve* hate speech and *block* normal speech. All your results would be wrong and you'd never know until the demo!

---

### 🔴 Step 4 — TF-IDF Baseline (P2 starts this in parallel)
**Owner:** P2 | **Can start:** Once Notebook 1 produces `processed/train.csv`

> 💡 **What's TF-IDF?** Think of it as counting word frequencies to guess if a comment is hateful. It's old-school but gives us a "dumb baseline" to show our fancy MuRIL model is actually better.

- [ ] Load `processed/train.csv`
- [ ] Train a simple TF-IDF + Logistic Regression model per language
- [ ] Report **macro-F1 score** (not accuracy!) for each language
- [ ] Save results to `results/baseline_results.json`

This creates the first column of **Table I** in the IEEE paper.

---

### 🔴 Step 5 — First MuRIL Training Run (P2, after Step 4)
**Owner:** P2 | **Estimated GPU time:** ~1.5–2 hours (unattended on Colab)

> 💡 **What's MuRIL?** Google's model pre-trained on 17 Indian languages. We're borrowing its knowledge of Indian languages and teaching it specifically about hate speech — this is called "fine-tuning."

- [ ] Connect to Google Drive in Colab
- [ ] Load `processed/train.csv`
- [ ] Set up MuRIL with these exact settings (don't change these!):
  - `max_length = 128`
  - `fp16 = True`
  - `batch_size = 32`
  - `learning_rate = 2e-5`
  - `epochs = 3`
  - Use **class-weighted loss** (important because Bengali is imbalanced!)
- [ ] Train on the pooled multilingual training set
- [ ] Evaluate on the test set, report **macro-F1 per language**
- [ ] Save the model checkpoint to Google Drive

---

### 🟡 Step P3 — Gradio Skeleton (P3, today)
**Owner:** P3 | **Can start immediately, runs in parallel**

> 💡 **What's Gradio?** A Python library that creates a simple webpage where users can type a comment and get a result back. No web development needed.

- [ ] Build a minimal web app with a text input box
- [ ] Connect it to a **fake/dummy classifier** that returns random results
- [ ] Make sure the `gr.HighlightedText` component works (this is what shows word highlights)
- [ ] Don't wait for the real model — P3 works against the fake one until P2 is done

---

### 🟡 Step P4 — Start Writing the Paper (P4, starts NOW)
**Owner:** P4 | **MUST start today, not Day 3!**

> ⚠️ The #1 way student projects fail: "we'll write the paper on Day 3." There isn't time. P4 writes while everyone else codes.

- [ ] Open Overleaf, start with the `IEEEtran` template
- [ ] Write **Section I — Introduction** (problem statement from §1.2 of master doc)
- [ ] Write **Section II — Related Work** (use the synopsis's 15-paper literature review)
- [ ] Write **Section III — Methodology** (the pipeline diagram from §3.1, label rules from §3.2)
- [ ] Leave blanks like `[TABLE I HERE]` wherever numbers will go
- [ ] Paper should be ~40% done by end of Day 1

---

## 📋 Day 2 Checklist (Preview)

| Step | Task | Owner |
|---|---|---|
| 6 | Transfer experiments B1–B5 | P2 |
| 6b | XLM-RoBERTa comparison run | P2 |
| 7 | Integrated Gradients + LIME benchmark | P3 |
| 8 | Wire `app.py` to the real model | P3 |
| 9 | Collect 60 real comments, hand-label them | P1 + native speaker |
| — | Write Methodology section; fill in tables as results arrive | P4 |

**End-of-Day-2 goal:** All experiments done, app working, paper ~70% written.

---

## 📋 Day 3 Checklist (Preview)

| Step | Task | Owner |
|---|---|---|
| 10 | Deploy to HuggingFace Spaces | P3 |
| 11 | Pilot study: 6 classmates, 10 comments each | All |
| 12 | Error analysis: 20 wrong predictions + why | Native speaker |
| — | Clean up code, write README, record demo video | All |
| 13 | Finish paper: Results, Discussion, Limitations | P4 |
| — | Demo rehearsal (timed, on the actual wifi) | All |

---

## 🛟 Mandatory Safety Checks (Must Run in Notebook 1)

These 5 checks are **non-negotiable** — don't skip them:

```
☐ 1. Zero overlap between training data and test data (leakage assertion)
☐ 2. Print 5 "abusive" rows from each source — verify they look abusive
☐ 3. Check 10 word-highlight outputs for correct word boundaries (Devanagari/Dravidian scripts split aggressively!)
☐ 4. Test app with: empty input, very long input (3000 chars), emoji-only input, wrong language
☐ 5. Full end-to-end run from a fresh Colab runtime (nothing cached)
```

---

## 🗺️ The Big Picture — Where Everything Fits

```
TODAY (Day 1)
  ✅ Downloaded data
  ✅ Verified schemas & labels
  ⬜ → Clean & unify data (Notebook 1)  ← YOU ARE HERE
  ⬜ → TF-IDF baseline

DAY 2
  ⬜ → Train MuRIL
  ⬜ → Transfer experiments (how much data does a new language need?)
  ⬜ → Build explainability layer (the word highlights)
  ⬜ → Wire up the web app

DAY 3
  ⬜ → Deploy live demo to HuggingFace
  ⬜ → Run pilot study with classmates
  ⬜ → Finish & submit IEEE paper
  ⬜ → Record demo video
```

---

## 🆘 If Things Go Wrong — Troubleshooting Guide

| Problem | What to do |
|---|---|
| Colab runs out of memory (OOM error) | 1st: set `max_length=128` 2nd: set `fp16=True` 3rd: reduce batch size to 16 AND add `gradient_accumulation_steps=2` |
| Model training is very slow | This is normal! Start it and do something else while it runs. |
| Confused about a term | Ask "explain that" in the chat — 30 seconds to ask saves an hour of confusion |
| Got an error | **Paste the FULL error message** (from `Traceback` to the last line) — not a summary |
| Dataset labels seem wrong | Re-read §4.3 of the master doc. Remember MACD is flipped! |
| Not sure what step we're on | We're at Step 3b. The master doc §7.2 always says the current step. |

---

## 📌 Quick Reference — The 4 Deliverables Being Built

| # | What | Tech Used | Who |
|---|---|---|---|
| D1 | 3 Colab notebooks + app code + README | Python, HuggingFace, Gradio | All |
| D2 | Trained MuRIL model file | HuggingFace Transformers | P2 |
| D3 | Results tables with all numbers | scikit-learn, Captum, LIME | P2+P3 |
| D4 | IEEE-format paper | Overleaf / LaTeX | P4 |
| D5 | Live public demo | HuggingFace Spaces | P3 |
| D6 | 3-minute demo video | Screen recording | P3 |

---

> 📎 **Source of truth:** [FairMod_Master_Context.md](file:///C:/Users/samya/Desktop/NLP%20DATASETS/FairMod_Master_Context.md)
> 
> **Next action right now:** Answer Blocker B1 (native speaker's language), then start Notebook 1 (Step 3b).
