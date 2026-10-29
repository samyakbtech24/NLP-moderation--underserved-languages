# =============================================================================
# FairMod — Evaluation bench API
# =============================================================================
# Inject labelled sentences (abusive / normal) through the real model in bulk
# and measure how well it does. Mounted by app.py under /eval.
#
#   GET  /eval/datasets          what the frozen test set offers (per language × label)
#   GET  /eval/sample            stratified sample from processed/test.csv
#   POST /eval/predict           ≤64 labelled items → per-item verdicts (+ IG words)
#   POST /eval/run               one-shot: items in, per-item results + metrics out
#   POST /eval/runs              save a finished run;  GET /eval/runs, /eval/runs/{id}
#   DELETE /eval/runs/{id}
#
# Labels are accepted as 1/0 or words: abusive/hate/offensive/toxic/yes/true
# vs normal/not/none/clean/no/false. Unlabelled items are classified but not scored.
# The CLI in evaluate.py drives these endpoints from a terminal.
# =============================================================================

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Callable, Optional, Union

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from moderation import detect_language

MAX_PREDICT = 64
MAX_RUN = 2000
TEST_CSV = os.path.join('processed', 'test.csv')

ABUSIVE_WORDS = {'1', 'abusive', 'hate', 'hateful', 'offensive', 'toxic', 'yes', 'true', 'abuse', 'flagged'}
NORMAL_WORDS = {'0', 'normal', 'not', 'none', 'clean', 'no', 'false', 'non-hate', 'not_offensive', 'neutral'}

SCHEMA = """
CREATE TABLE IF NOT EXISTS eval_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    n INTEGER NOT NULL,
    metrics TEXT NOT NULL,
    results TEXT NOT NULL
);
"""


def parse_label(v) -> Optional[int]:
    """1 = abusive, 0 = normal, None = unlabelled / unknown."""
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return 1 if v >= 0.5 else 0
    s = str(v).strip().lower()
    if s in ABUSIVE_WORDS:
        return 1
    if s in NORMAL_WORDS:
        return 0
    return None


def _f1(p, r):
    return 2 * p * r / (p + r) if p + r else 0.0


def compute_metrics(results: list[dict]) -> dict:
    """Accuracy, per-class P/R/F1, macro-F1, confusion matrix and a per-language breakdown.
    Only items with a known expected label are scored."""
    scored = [r for r in results if r.get('expected') is not None]

    def block(rows):
        tp = sum(r['expected'] == 1 and r['predicted'] == 1 for r in rows)
        tn = sum(r['expected'] == 0 and r['predicted'] == 0 for r in rows)
        fp = sum(r['expected'] == 0 and r['predicted'] == 1 for r in rows)
        fn = sum(r['expected'] == 1 and r['predicted'] == 0 for r in rows)
        n = len(rows)
        p1 = tp / (tp + fp) if tp + fp else 0.0
        r1 = tp / (tp + fn) if tp + fn else 0.0
        p0 = tn / (tn + fn) if tn + fn else 0.0
        r0 = tn / (tn + fp) if tn + fp else 0.0
        f1_abusive, f1_normal = _f1(p1, r1), _f1(p0, r0)
        return {
            'n': n,
            'accuracy': (tp + tn) / n if n else 0.0,
            'macro_f1': (f1_abusive + f1_normal) / 2 if n else 0.0,
            'abusive': {'precision': p1, 'recall': r1, 'f1': f1_abusive, 'support': tp + fn},
            'normal': {'precision': p0, 'recall': r0, 'f1': f1_normal, 'support': tn + fp},
            'confusion': {'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn},
        }

    out = block(scored)
    out['total'] = len(results)
    out['unlabelled'] = len(results) - len(scored)
    langs = sorted({r.get('language') or 'other' for r in scored})
    out['by_language'] = {l: block([r for r in scored if (r.get('language') or 'other') == l]) for l in langs}
    right = [r['confidence'] for r in scored if r['expected'] == r['predicted']]
    wrong = [r['confidence'] for r in scored if r['expected'] != r['predicted']]
    out['mean_confidence_correct'] = sum(right) / len(right) if right else None
    out['mean_confidence_wrong'] = sum(wrong) / len(wrong) if wrong else None
    lat = [r['latency_ms'] for r in results if r.get('latency_ms')]
    out['mean_latency_ms'] = sum(lat) / len(lat) if lat else None
    return out


class EvalItem(BaseModel):
    text: str = Field(..., max_length=5000)
    label: Optional[Union[int, float, str, bool]] = None
    language: Optional[str] = Field(None, max_length=10)
    id: Optional[Union[int, str]] = None

class PredictRequest(BaseModel):
    items: list[EvalItem] = Field(..., max_length=MAX_PREDICT)
    explain: bool = True

class RunRequest(BaseModel):
    items: list[EvalItem] = Field(..., max_length=MAX_RUN)
    explain: bool = False

class SaveRunRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    source: str = Field('custom', max_length=60)
    results: list[dict] = Field(..., max_length=MAX_RUN)


def make_router(classify: Callable[[str], dict], predict_proba: Callable[[list[str]], list[float]],
                db_path: Optional[str] = None, test_csv: str = TEST_CSV) -> APIRouter:
    """classify(text) → /classify payload (with IG); predict_proba(texts) → P(abusive) per text (fast path)."""
    db_path = db_path or os.environ.get('FAIRMOD_DB', os.path.join('data', 'fairmod.db'))
    if db_path != ':memory:':
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    shared = sqlite3.connect(db_path, check_same_thread=False) if db_path == ':memory:' else None

    @contextmanager
    def connect():
        conn = shared or sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            if conn is not shared:
                conn.close()

    with connect() as conn:
        conn.executescript(SCHEMA)

    test_df = None

    def load_test():
        nonlocal test_df
        if test_df is None:
            if not os.path.exists(test_csv):
                raise HTTPException(status_code=404, detail=f"Test set not found at {test_csv}.")
            import pandas as pd
            test_df = pd.read_csv(test_csv).dropna(subset=['text'])
        return test_df

    def run_items(items: list[EvalItem], explain: bool) -> list[dict]:
        texts = [it.text.strip() for it in items]
        results = []
        fast = None if explain else predict_proba([t for t in texts if t])
        k = 0
        for it, text in zip(items, texts):
            expected = parse_label(it.label)
            language = it.language or detect_language(text)
            if not text:
                continue
            t0 = time.perf_counter()
            if explain:
                try:
                    r = classify(text)
                except ValueError:
                    continue
                p = float(r['probabilities'].get('abusive', 0.0))
                words, latency = r['word_scores'], r.get('latency_ms', 0.0)
            else:
                p = float(fast[k])
                k += 1
                words, latency = None, (time.perf_counter() - t0) * 1000
            predicted = 1 if p >= 0.5 else 0
            results.append({
                'id': it.id,
                'text': text,
                'language': language,
                'expected': expected,
                'predicted': predicted,
                'p_abusive': round(p, 4),
                'confidence': round(p if predicted else 1 - p, 4),
                'correct': None if expected is None else expected == predicted,
                'word_scores': words,
                'latency_ms': round(latency, 1),
            })
        return results

    router = APIRouter(prefix='/eval', tags=['evaluation bench'])

    @router.get('/datasets')
    def datasets():
        df = load_test()
        counts = df.groupby(['language', 'label']).size()
        langs = {}
        for (lang, label), n in counts.items():
            langs.setdefault(lang, {'abusive': 0, 'normal': 0})['abusive' if label == 1 else 'normal'] = int(n)
        return {'name': 'FairMod frozen test set', 'path': test_csv, 'total': int(len(df)), 'languages': langs}

    @router.get('/sample')
    def sample(per_cell: int = Query(10, ge=1, le=250), languages: str = 'hi,kn,mr,bn', seed: int = 42):
        """per_cell items for every language × label pair, so classes and languages are balanced."""
        df = load_test()
        wanted = [l.strip() for l in languages.split(',') if l.strip()]
        parts = []
        for lang in wanted:
            for label in (1, 0):
                cell = df[(df.language == lang) & (df.label == label)]
                if len(cell):
                    parts.append(cell.sample(n=min(per_cell, len(cell)), random_state=seed))
        if not parts:
            raise HTTPException(status_code=422, detail="No items for those languages.")
        import pandas as pd
        out = pd.concat(parts).sample(frac=1, random_state=seed)
        return {'items': [{'id': f'test-{i}', 'text': r.text, 'label': int(r.label), 'language': r.language,
                           'source': r.source} for i, r in out.iterrows()]}

    @router.post('/predict')
    def predict(req: PredictRequest):
        return {'results': run_items(req.items, req.explain)}

    @router.post('/run')
    def run(req: RunRequest):
        results = run_items(req.items, req.explain)
        return {'metrics': compute_metrics(results), 'results': results}

    @router.post('/runs')
    def save_run(req: SaveRunRequest):
        metrics = compute_metrics(req.results)
        with connect() as conn:
            cur = conn.execute(
                "INSERT INTO eval_runs (name, source, created_at, n, metrics, results) VALUES (?,?,?,?,?,?)",
                (req.name, req.source, datetime.now(timezone.utc).isoformat(timespec='seconds'), len(req.results),
                 json.dumps(metrics), json.dumps(req.results, ensure_ascii=False)))
            return {'id': cur.lastrowid, 'metrics': metrics}

    @router.get('/runs')
    def list_runs():
        with connect() as conn:
            rows = conn.execute("SELECT id, name, source, created_at, n, metrics FROM eval_runs ORDER BY id DESC").fetchall()
        return [{**dict(r), 'metrics': json.loads(r['metrics'])} for r in rows]

    @router.get('/runs/{run_id}')
    def get_run(run_id: int):
        with connect() as conn:
            r = conn.execute("SELECT * FROM eval_runs WHERE id = ?", (run_id,)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Run not found.")
        return {**dict(r), 'metrics': json.loads(r['metrics']), 'results': json.loads(r['results'])}

    @router.delete('/runs/{run_id}')
    def delete_run(run_id: int):
        with connect() as conn:
            if not conn.execute("DELETE FROM eval_runs WHERE id = ?", (run_id,)).rowcount:
                raise HTTPException(status_code=404, detail="Run not found.")
        return {'deleted': run_id}

    return router
