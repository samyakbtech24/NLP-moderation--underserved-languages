# =============================================================================
# FairMod — Demo app: FastAPI + Gradio in one process (P3, master §5.6)
# =============================================================================
#   POST /classify  {"text": "..."} → {label, confidence, word_scores, ...}
#   POST /bulk      {"texts": [...]} → ranked [{text, p_abusive, flagged}, ...]
#   GET  /health    → model + device info
#   GET  /docs      → auto-generated API docs (screenshot for the paper)
#   /               → Gradio UI: single comment with word highlights,
#                     and a CSV tab that ranks many comments at once
#
# The model is loaded ONCE at startup. Where it comes from:
#   MODEL_ID env var — a HF Hub repo id (e.g. yourname/fairmod-muril) or a
#   local folder. Default: checkpoints/muril_pooled/final
#   For a private Hub repo, set HF_TOKEN as a Space secret.
#
# RUN LOCALLY : MODEL_ID=/path/to/final python app.py   → http://localhost:7860
# ON SPACES   : see README, Step 10
#
# HIGHLIGHT MEANING: Integrated Gradients scores are computed for the ABUSIVE
# class. Red (positive) = the word pushed the model towards "abusive";
# blue (negative) = towards "normal". With two classes this is the same ranking
# as explaining the predicted class, just with a fixed, readable sign.
# =============================================================================

import os

import gradio as gr
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from fairmod_explain import FairModExplainer, clean_text, normalise
from moderation import make_router as make_moderation_router
from evaluation import make_router as make_evaluation_router

MODEL_ID     = os.environ.get('MODEL_ID', 'checkpoints/muril_pooled/final')
MAX_CHARS    = 5000     # hard cap on input size; the model only reads 128 tokens anyway
MAX_CSV_ROWS = 2000     # CPU Basic Space: keep bulk jobs to well under a minute

# Resolve local folders; Hub ids look like "user/fairmod-muril" (exactly one slash).
_parts = MODEL_ID.replace('\\', '/').strip('/').split('/')
_is_hub_id = len(_parts) == 2 and all(_parts) and not _parts[0] in ('.', '..', 'checkpoints')
if os.path.isdir(MODEL_ID):
    MODEL_ID = os.path.abspath(MODEL_ID)
elif not _is_hub_id:
    raise SystemExit(
        f"No model checkpoint at '{MODEL_ID}'.\n\n"
        "The trained MuRIL weights are not in git (~1 GB). Do one of:\n"
        "  1. Copy the team Drive folder to checkpoints/muril_pooled/final\n"
        "     (needs config.json, tokenizer files, and model.safetensors / pytorch_model.bin)\n"
        "  2. Or point at a Hugging Face repo after Cell 13 upload, e.g. in PowerShell:\n"
        "       $env:MODEL_ID = 'yourname/fairmod-muril'\n"
        "       python app.py\n"
    )

explainer = FairModExplainer(MODEL_ID)
ABUSIVE = explainer.model.config.label2id.get('abusive', 1)
print(f"FairMod model loaded: {MODEL_ID} on {explainer.device} | labels {explainer.labels}")


def classify(text):
    """Clean, classify and explain one comment. Raises ValueError on empty input."""
    text = clean_text(text)
    if not text:
        raise ValueError("Comment is empty (after removing URLs and @mentions).")
    x = explainer.explain(text, target=ABUSIVE)
    scores = normalise(x['scores'])
    return {
        'label': explainer.labels[x['pred']],
        'confidence': round(x['probs'][x['pred']], 4),
        'probabilities': {l: round(p, 4) for l, p in zip(explainer.labels, x['probs'])},
        'word_scores': [{'word': w, 'score': None if s is None else round(s, 4)}
                        for w, s in zip(x['words'], scores)],
        'truncated': x['truncated'],
        'latency_ms': round(x['latency_ms'], 1),
    }


# ─── FastAPI ────────────────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    text: str = Field(..., max_length=MAX_CHARS, description="One comment, any of hi / kn / mr / bn")

class BulkRequest(BaseModel):
    texts: list[str] = Field(..., max_length=MAX_CSV_ROWS, description="Up to 2000 comments to rank")

app = FastAPI(title="FairMod API",
              description="Explainable abusive-comment detection for Hindi, Kannada, Marathi and Bengali.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post('/classify')
def classify_endpoint(req: ClassifyRequest):
    try:
        return classify(req.text)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post('/bulk')
def bulk_endpoint(req: BulkRequest):
    """Rank comments by abusive probability (no IG — same path as Gradio CSV tab)."""
    if not req.texts:
        raise HTTPException(status_code=422, detail="No texts provided.")
    cleaned = []
    for t in req.texts[:MAX_CSV_ROWS]:
        c = clean_text(t)
        if c and len(c) <= MAX_CHARS:
            cleaned.append(c)
    if not cleaned:
        raise HTTPException(status_code=422, detail="No non-empty comments found.")
    probs = explainer.predict_proba(cleaned)
    rows = []
    for text, p in zip(cleaned, probs):
        p_abusive = round(float(p[ABUSIVE]), 4)
        rows.append({
            'text': text,
            'p_abusive': p_abusive,
            'flagged': p_abusive >= 0.5,
        })
    rows.sort(key=lambda r: r['p_abusive'], reverse=True)
    flagged = sum(1 for r in rows if r['flagged'])
    return {
        'results': rows,
        'flagged': flagged,
        'total': len(rows),
    }

@app.get('/health')
def health():
    return {'status': 'ok', 'model': MODEL_ID, 'device': explainer.device}

# Moderation console (policy engine, review queue, lists, decision log, analytics) — see moderation.py
app.include_router(make_moderation_router(classify))

# Evaluation bench (labelled bulk testing + metrics) — see evaluation.py and evaluate.py
def p_abusive_fast(texts):
    probs = explainer.predict_proba([clean_text(t) or t for t in texts])
    return [float(p[ABUSIVE]) for p in probs]

app.include_router(make_evaluation_router(classify, p_abusive_fast))


# ─── Gradio UI ──────────────────────────────────────────────────────────────

def ui_single(text):
    try:
        r = classify(text)
    except ValueError as e:
        return {}, [], f"⚠️ {e}"
    highlights = []
    for i, ws in enumerate(r['word_scores']):
        if i:
            highlights.append((' ', None))
        highlights.append((ws['word'], ws['score']))
    note = f"Explained in {r['latency_ms']:.0f} ms."
    if r['truncated']:
        note += " Long comment: only the first 128 tokens were read; un-highlighted words at the end were not seen."
    return r['probabilities'], highlights, note

def ui_bulk(file):
    if file is None:
        return None, "Upload a CSV file first."
    path = file if isinstance(file, str) else file.name
    try:
        df = pd.read_csv(path)
    except Exception as e:
        return None, f"⚠️ Could not read CSV: {e}"
    col = 'text' if 'text' in df.columns else df.columns[0]
    df = df[[col]].rename(columns={col: 'text'}).head(MAX_CSV_ROWS)
    df['text'] = df['text'].fillna('').astype(str).map(clean_text)
    df = df[df['text'].str.len() > 0]
    if df.empty:
        return None, "No non-empty comments found."
    probs = explainer.predict_proba(df['text'].tolist())
    df['p_abusive'] = probs[:, ABUSIVE].round(4)
    df['flagged'] = df['p_abusive'] >= 0.5
    df = df.sort_values('p_abusive', ascending=False)
    return df, (f"{int(df['flagged'].sum())} of {len(df)} comments flagged (column used: '{col}'). "
                "Click a column header to sort.")

with gr.Blocks(title="FairMod") as demo:
    gr.Markdown(
        "# FairMod\n"
        "Explainable abusive-comment detection for **Hindi, Kannada, Marathi and Bengali** "
        "(fine-tuned MuRIL). Highlighted words show *why*: "
        "**red** pushed the model towards *abusive*, **blue** towards *normal*.\n\n"
        "_Content warning: test inputs may contain offensive language. "
        "This is a research prototype and makes mistakes; keep a human in the loop._")
    with gr.Tab("Check a comment"):
        inp = gr.Textbox(label="Comment", lines=4, max_length=MAX_CHARS,
                         placeholder="Paste a comment in Hindi, Kannada, Marathi or Bengali")
        btn = gr.Button("Classify", variant="primary")
        out_label = gr.Label(label="Prediction", num_top_classes=2)
        out_hl = gr.HighlightedText(label="Word-level explanation (Integrated Gradients)",
                                    combine_adjacent=False, show_legend=True)
        out_note = gr.Markdown()
        btn.click(ui_single, inp, [out_label, out_hl, out_note])
        inp.submit(ui_single, inp, [out_label, out_hl, out_note])
    with gr.Tab("Bulk CSV"):
        gr.Markdown(f"Upload a CSV with a `text` column (otherwise the first column is used). "
                    f"Up to {MAX_CSV_ROWS} rows. Comments are ranked by how likely they are abusive.")
        f_in = gr.File(label="CSV file", file_types=['.csv'])
        f_btn = gr.Button("Rank comments", variant="primary")
        f_note = gr.Markdown()
        f_out = gr.Dataframe(label="Ranked comments", interactive=False, wrap=True)
        f_btn.click(ui_bulk, f_in, [f_out, f_note])

app = gr.mount_gradio_app(app, demo, path='/')

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 7860)))
