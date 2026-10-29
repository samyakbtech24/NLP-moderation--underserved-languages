# =============================================================================
# FairMod — Moderation console backend (Tier 1)
# =============================================================================
# Turns the classifier into a moderation workflow:
#
#   comment ─► classify + IG ─► blocklist / allowlist ─► active policy
#           ─► action: allow | review | remove  (+ statement of reasons)
#           ─► review queue ─► moderator decision ─► decision log + audit log
#
# Everything is stored in one SQLite file (FAIRMOD_DB, default data/fairmod.db).
# All routes live under /mod and are mounted by app.py via make_router().
#
#   POST /mod/moderate              one comment through the pipeline
#   POST /mod/moderate/batch        up to 200 comments
#   GET  /mod/items                 decision log (filters: status, language, decided_by, q)
#   GET  /mod/items/{id}            one item + author strike count
#   POST /mod/items/{id}/decision   moderator approve / remove (also overrides)
#   GET/POST/PUT /mod/policies      threshold presets; POST /mod/policies/{id}/activate
#   GET/POST/DELETE /mod/lists      blocklist / allowlist terms
#   GET  /mod/analytics             dashboard numbers
#   GET  /mod/audit                 who changed what, when
#   GET  /mod/export.csv            full decision log as CSV
# =============================================================================

import csv
import io
import json
import os
import re
import sqlite3
import statistics
import unicodedata
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

MAX_CHARS = 5000
MAX_BATCH = 200
EVIDENCE_SCORE = 0.25   # normalised IG score above which a word counts as evidence for "abusive"

SCHEMA = """
CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    review_threshold REAL NOT NULL,
    remove_threshold REAL NOT NULL,
    blocklist_action TEXT NOT NULL DEFAULT 'remove',
    is_active INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list TEXT NOT NULL,
    term TEXT NOT NULL,
    language TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    language TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'anonymous',
    source TEXT NOT NULL DEFAULT 'comments',
    p_abusive REAL NOT NULL,
    word_scores TEXT NOT NULL,
    latency_ms REAL NOT NULL DEFAULT 0,
    policy_id INTEGER,
    policy_name TEXT NOT NULL,
    auto_action TEXT NOT NULL,
    rule TEXT NOT NULL,
    auto_reason TEXT NOT NULL,
    status TEXT NOT NULL,
    decided_by TEXT NOT NULL DEFAULT 'system',
    category TEXT,
    moderator_note TEXT,
    final_reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    event TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '{}'
);
"""

DEFAULT_POLICIES = [
    ("Balanced", "General-purpose default. Clear abuse is removed, borderline goes to a human.", 0.5, 0.9, 'remove', 1),
    ("Strict — kids & education", "Low tolerance. More goes to review; blocklist hits are removed.", 0.3, 0.7, 'remove', 0),
    ("Lenient — news & debate", "Heated but civil debate stays up. Only near-certain abuse is removed.", 0.7, 0.97, 'review', 0),
]

CATEGORIES = ["Insult / harassment", "Hate / identity attack", "Threat", "Profanity",
              "Spam", "Not abusive (false positive)", "Other"]

# Words that are common in Marathi but rare in Hindi (and vice versa), for Devanagari text.
_MR_MARKERS = {'आहे', 'आहेस', 'आहेत', 'नाही', 'तुला', 'मला', 'आणि', 'काय', 'होता', 'होती', 'आम्ही',
               'तुम्ही', 'इथून', 'खूप', 'बस', 'तुझं', 'तुझा', 'तुझी', 'आज', 'उद्या'}
_HI_MARKERS = {'है', 'हैं', 'नहीं', 'का', 'की', 'के', 'में', 'से', 'और', 'तुम', 'आप', 'हो', 'था', 'थी',
               'यह', 'वह', 'क्या', 'बहुत', 'तू', 'तेरी', 'तेरा'}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def strip_punct(word):
    return ''.join(c for c in word if not unicodedata.category(c).startswith('P')).casefold()


def detect_language(text):
    """Script-based language guess: kn / bn / hi / mr, or 'other' (Latin, mixed, emoji…)."""
    counts = Counter()
    for c in text:
        o = ord(c)
        if 0x0C80 <= o <= 0x0CFF:
            counts['kn'] += 1
        elif 0x0980 <= o <= 0x09FF:
            counts['bn'] += 1
        elif 0x0900 <= o <= 0x097F:
            counts['deva'] += 1
        elif c.isalpha():
            counts['latin'] += 1
    if not counts:
        return 'other'
    script = counts.most_common(1)[0][0]
    if script == 'latin':
        return 'other'
    if script != 'deva':
        return script
    words = {strip_punct(w) for w in text.split()}
    mr = len(words & _MR_MARKERS) + 2 * text.count('ळ')
    hi = len(words & _HI_MARKERS)
    return 'mr' if mr > hi else 'hi'


def term_hits(text, terms):
    """Terms (rows with .term) found in text. Multi-word terms match as substrings;
    single terms of 3+ characters match any word that contains them (so गध catches
    गधा / गधे), shorter ones must match a whole word."""
    tokens = [strip_punct(w) for w in text.split()]
    flat = ' '.join(tokens)
    hits = []
    for t in terms:
        term = strip_punct(t['term']) if ' ' not in t['term'] else t['term'].casefold()
        if not term:
            continue
        if ' ' in term:
            found = term in flat
        elif len(term) >= 3:
            found = any(term in tok for tok in tokens)
        else:
            found = term in tokens
        if found:
            hits.append(t['term'])
    return hits


def pct(p):
    return f"{p * 100:.1f}%"


def evaluate(text, language, p_abusive, word_scores, policy, block_terms, allow_terms):
    """Apply blocklist, allowlist and thresholds. Returns (action, rule, reason)."""
    name = policy['name']
    review_t, remove_t = policy['review_threshold'], policy['remove_threshold']
    evidence = sorted((w for w in word_scores if (w['score'] or 0) >= EVIDENCE_SCORE),
                      key=lambda w: -w['score'])
    key_words = ', '.join(w['word'] for w in evidence[:3])
    because = f" Words that most influenced the model: {key_words}." if key_words else ""

    applicable = lambda rows: [r for r in rows if r['language'] in (None, '', language)]
    blocked = term_hits(text, applicable(block_terms))
    if blocked:
        action = policy['blocklist_action']
        verb = "Removed" if action == 'remove' else "Sent to human review"
        return action, 'blocklist', (
            f"{verb} under policy “{name}”: contains blocklisted term(s) {', '.join(blocked)}. "
            f"Model abusive probability was {pct(p_abusive)}.")

    if p_abusive >= review_t and evidence:
        allowed_words = {strip_punct(w) for w in term_hits(' '.join(w['word'] for w in evidence),
                                                            applicable(allow_terms))}
        if allowed_words and all(any(a in strip_punct(w['word']) for a in allowed_words) for w in evidence):
            return 'allow', 'allowlist', (
                f"Allowed under policy “{name}”: the model scored {pct(p_abusive)} abusive, but every word "
                f"driving that score ({key_words}) is on the allowlist.")

    if p_abusive >= remove_t:
        return 'remove', 'auto_remove', (
            f"Removed automatically under policy “{name}”: abusive probability {pct(p_abusive)} is at or "
            f"above the removal threshold of {pct(remove_t)}.{because}")
    if p_abusive >= review_t:
        return 'review', 'review_band', (
            f"Sent to human review under policy “{name}”: abusive probability {pct(p_abusive)} falls between "
            f"the review ({pct(review_t)}) and removal ({pct(remove_t)}) thresholds.{because}")
    return 'allow', 'below_threshold', (
        f"Allowed under policy “{name}”: abusive probability {pct(p_abusive)} is below the review "
        f"threshold of {pct(review_t)}.")


STATUS_FOR_ACTION = {'allow': 'allowed', 'review': 'pending', 'remove': 'removed'}


# ─── Request models ─────────────────────────────────────────────────────────

class ModerateRequest(BaseModel):
    text: str = Field(..., max_length=MAX_CHARS)
    author: str = Field('anonymous', max_length=80)
    source: str = Field('comments', max_length=40)

class BatchRequest(BaseModel):
    items: list[ModerateRequest] = Field(..., max_length=MAX_BATCH)

class DecisionRequest(BaseModel):
    decision: Literal['approve', 'remove']
    moderator: str = Field(..., min_length=1, max_length=80)
    category: Optional[str] = Field(None, max_length=60)
    note: str = Field('', max_length=1000)

class PolicyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field('', max_length=300)
    review_threshold: float = Field(..., ge=0.01, le=1)
    remove_threshold: float = Field(..., ge=0.01, le=1)
    blocklist_action: Literal['remove', 'review'] = 'remove'
    actor: str = Field('admin', max_length=80)

class TermRequest(BaseModel):
    list: Literal['block', 'allow']
    term: str = Field(..., min_length=1, max_length=80)
    language: Optional[Literal['hi', 'kn', 'mr', 'bn']] = None
    note: str = Field('', max_length=200)
    actor: str = Field('admin', max_length=80)


# ─── Router ─────────────────────────────────────────────────────────────────

def make_router(classify: Callable[[str], dict], db_path: Optional[str] = None) -> APIRouter:
    """classify(text) must return the /classify payload (probabilities, word_scores, latency_ms)
    and raise ValueError on empty input."""
    db_path = db_path or os.environ.get('FAIRMOD_DB', os.path.join('data', 'fairmod.db'))
    if db_path != ':memory:':
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

    shared = sqlite3.connect(db_path, check_same_thread=False) if db_path == ':memory:' else None

    @contextmanager
    def connect():
        """One connection per request; commits on success, rolls back on error."""
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
        if not conn.execute("SELECT 1 FROM policies LIMIT 1").fetchone():
            conn.executemany(
                "INSERT INTO policies (name, description, review_threshold, remove_threshold, "
                "blocklist_action, is_active, updated_at) VALUES (?,?,?,?,?,?,?)",
                [p + (now_iso(),) for p in DEFAULT_POLICIES])

    def audit(conn, actor, event, target='', **detail):
        conn.execute("INSERT INTO audit (ts, actor, event, target, detail) VALUES (?,?,?,?,?)",
                     (now_iso(), actor, event, target, json.dumps(detail, ensure_ascii=False)))

    def active_policy(conn):
        row = conn.execute("SELECT * FROM policies WHERE is_active = 1").fetchone()
        return row or conn.execute("SELECT * FROM policies ORDER BY id LIMIT 1").fetchone()

    def item_out(row, conn=None):
        d = dict(row)
        d['word_scores'] = json.loads(d['word_scores'])
        if conn is not None:
            d['author_strikes'] = conn.execute(
                "SELECT COUNT(*) FROM items WHERE author = ? AND status = 'removed' AND author != 'anonymous'",
                (d['author'],)).fetchone()[0]
        return d

    def moderate_one(conn, req: ModerateRequest):
        try:
            r = classify(req.text)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        p = float(r['probabilities'].get('abusive', 0.0))
        language = detect_language(req.text)
        policy = active_policy(conn)
        terms = conn.execute("SELECT * FROM list_terms").fetchall()
        action, rule, reason = evaluate(
            req.text, language, p, r['word_scores'], policy,
            [t for t in terms if t['list'] == 'block'], [t for t in terms if t['list'] == 'allow'])
        ts = now_iso()
        cur = conn.execute(
            "INSERT INTO items (text, language, author, source, p_abusive, word_scores, latency_ms, "
            "policy_id, policy_name, auto_action, rule, auto_reason, status, final_reason, created_at, decided_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (req.text.strip(), language, req.author.strip() or 'anonymous', req.source, p,
             json.dumps(r['word_scores'], ensure_ascii=False), r.get('latency_ms', 0),
             policy['id'], policy['name'], action, rule, reason, STATUS_FOR_ACTION[action], reason,
             ts, None if action == 'review' else ts))
        return item_out(conn.execute("SELECT * FROM items WHERE id = ?", (cur.lastrowid,)).fetchone(), conn)

    router = APIRouter(prefix='/mod', tags=['moderation console'])

    @router.post('/moderate')
    def moderate(req: ModerateRequest):
        with connect() as conn:
            return moderate_one(conn, req)

    @router.post('/moderate/batch')
    def moderate_batch(req: BatchRequest):
        out, skipped = [], 0
        with connect() as conn:
            for it in req.items:
                try:
                    out.append(moderate_one(conn, it))
                except HTTPException:
                    skipped += 1
        counts = Counter(i['auto_action'] for i in out)
        return {'items': out, 'skipped': skipped,
                'summary': {a: counts.get(a, 0) for a in ('allow', 'review', 'remove')}}

    @router.get('/items')
    def list_items(status: Optional[str] = None, language: Optional[str] = None,
                   decided_by: Optional[Literal['system', 'human']] = None,
                   q: Optional[str] = None, order: Literal['newest', 'oldest', 'risk'] = 'newest',
                   limit: int = Query(50, ge=1, le=1000), offset: int = Query(0, ge=0)):
        where, args = [], []
        if status:
            where.append("status = ?"); args.append(status)
        if language:
            where.append("language = ?"); args.append(language)
        if decided_by == 'system':
            where.append("decided_by = 'system'")
        elif decided_by == 'human':
            where.append("decided_by != 'system'")
        if q:
            where.append("(text LIKE ? OR author LIKE ?)"); args += [f'%{q}%', f'%{q}%']
        clause = ('WHERE ' + ' AND '.join(where)) if where else ''
        order_by = {'newest': 'id DESC', 'oldest': 'id ASC', 'risk': 'p_abusive DESC'}[order]
        with connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM items {clause}", args).fetchone()[0]
            rows = conn.execute(f"SELECT * FROM items {clause} ORDER BY {order_by} LIMIT ? OFFSET ?",
                                args + [limit, offset]).fetchall()
            return {'total': total, 'items': [item_out(r) for r in rows]}

    @router.get('/items/{item_id}')
    def get_item(item_id: int):
        with connect() as conn:
            row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Item not found.")
            return item_out(row, conn)

    @router.post('/items/{item_id}/decision')
    def decide(item_id: int, req: DecisionRequest):
        with connect() as conn:
            row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Item not found.")
            status = 'approved' if req.decision == 'approve' else 'removed'
            was = row['status']
            verb = "Approved (kept up)" if status == 'approved' else "Removed"
            kind = "after review" if was == 'pending' else f"overriding the earlier decision ({was})"
            reason = f"{verb} by moderator {req.moderator} {kind}."
            if req.category:
                reason += f" Category: {req.category}."
            if req.note.strip():
                reason += f" Note: {req.note.strip()}"
            reason += f" Original automated assessment: {row['auto_reason']}"
            conn.execute("UPDATE items SET status=?, decided_by=?, category=?, moderator_note=?, "
                         "final_reason=?, decided_at=? WHERE id=?",
                         (status, req.moderator, req.category, req.note.strip(), reason, now_iso(), item_id))
            audit(conn, req.moderator, 'item.decision', f'item #{item_id}',
                  decision=req.decision, previous_status=was, category=req.category)
            return item_out(conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone(), conn)

    @router.get('/categories')
    def categories():
        return CATEGORIES

    # ── policies ──

    def check_thresholds(req):
        if req.review_threshold > req.remove_threshold:
            raise HTTPException(status_code=422, detail="Review threshold must be at or below the removal threshold.")

    @router.get('/policies')
    def list_policies():
        with connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM policies ORDER BY id")]

    @router.post('/policies')
    def create_policy(req: PolicyRequest):
        check_thresholds(req)
        with connect() as conn:
            cur = conn.execute(
                "INSERT INTO policies (name, description, review_threshold, remove_threshold, "
                "blocklist_action, is_active, updated_at) VALUES (?,?,?,?,?,0,?)",
                (req.name, req.description, req.review_threshold, req.remove_threshold,
                 req.blocklist_action, now_iso()))
            audit(conn, req.actor, 'policy.created', req.name,
                  review=req.review_threshold, remove=req.remove_threshold)
            return dict(conn.execute("SELECT * FROM policies WHERE id = ?", (cur.lastrowid,)).fetchone())

    @router.put('/policies/{policy_id}')
    def update_policy(policy_id: int, req: PolicyRequest):
        check_thresholds(req)
        with connect() as conn:
            old = conn.execute("SELECT * FROM policies WHERE id = ?", (policy_id,)).fetchone()
            if not old:
                raise HTTPException(status_code=404, detail="Policy not found.")
            conn.execute("UPDATE policies SET name=?, description=?, review_threshold=?, remove_threshold=?, "
                         "blocklist_action=?, updated_at=? WHERE id=?",
                         (req.name, req.description, req.review_threshold, req.remove_threshold,
                          req.blocklist_action, now_iso(), policy_id))
            audit(conn, req.actor, 'policy.updated', req.name,
                  review=[old['review_threshold'], req.review_threshold],
                  remove=[old['remove_threshold'], req.remove_threshold],
                  blocklist_action=[old['blocklist_action'], req.blocklist_action])
            return dict(conn.execute("SELECT * FROM policies WHERE id = ?", (policy_id,)).fetchone())

    @router.post('/policies/{policy_id}/activate')
    def activate_policy(policy_id: int, actor: str = 'admin'):
        with connect() as conn:
            row = conn.execute("SELECT * FROM policies WHERE id = ?", (policy_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Policy not found.")
            conn.execute("UPDATE policies SET is_active = (id = ?)", (policy_id,))
            audit(conn, actor, 'policy.activated', row['name'])
            return dict(conn.execute("SELECT * FROM policies WHERE id = ?", (policy_id,)).fetchone())

    # ── lists ──

    @router.get('/lists')
    def list_terms():
        with connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM list_terms ORDER BY id DESC")]

    @router.post('/lists')
    def add_term(req: TermRequest):
        term = req.term.strip()
        with connect() as conn:
            dup = conn.execute("SELECT 1 FROM list_terms WHERE list=? AND term=? AND IFNULL(language,'')=?",
                               (req.list, term, req.language or '')).fetchone()
            if dup:
                raise HTTPException(status_code=409, detail="That term is already on the list.")
            cur = conn.execute("INSERT INTO list_terms (list, term, language, note, created_at) VALUES (?,?,?,?,?)",
                               (req.list, term, req.language, req.note, now_iso()))
            audit(conn, req.actor, f'{req.list}list.added', term, language=req.language)
            return dict(conn.execute("SELECT * FROM list_terms WHERE id = ?", (cur.lastrowid,)).fetchone())

    @router.delete('/lists/{term_id}')
    def delete_term(term_id: int, actor: str = 'admin'):
        with connect() as conn:
            row = conn.execute("SELECT * FROM list_terms WHERE id = ?", (term_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Term not found.")
            conn.execute("DELETE FROM list_terms WHERE id = ?", (term_id,))
            audit(conn, actor, f"{row['list']}list.removed", row['term'], language=row['language'])
            return {'deleted': term_id}

    # ── analytics / audit / export ──

    @router.get('/analytics')
    def analytics():
        with connect() as conn:
            rows = conn.execute("SELECT * FROM items").fetchall()
            policy = active_policy(conn)
        total = len(rows)
        status = Counter(r['status'] for r in rows)
        auto = Counter(r['auto_action'] for r in rows)
        rules = Counter(r['rule'] for r in rows)

        by_lang = {}
        for r in rows:
            d = by_lang.setdefault(r['language'], {'total': 0, 'allow': 0, 'review': 0, 'remove': 0})
            d['total'] += 1
            d[r['auto_action']] += 1

        human = [r for r in rows if r['decided_by'] != 'system']
        agree = sum((r['p_abusive'] >= 0.5) == (r['status'] == 'removed') for r in human)
        waits = []
        for r in human:
            if r['decided_at']:
                waits.append((datetime.fromisoformat(r['decided_at']) -
                              datetime.fromisoformat(r['created_at'])).total_seconds())

        words = Counter()
        for r in rows:
            if r['status'] == 'removed':
                for w in json.loads(r['word_scores']):
                    if (w['score'] or 0) >= 0.3:
                        clean = strip_punct(w['word'])
                        if clean:
                            words[(clean, r['language'])] += 1

        today = datetime.now(timezone.utc).date()
        days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
        daily = {d: {'date': d, 'allow': 0, 'review': 0, 'remove': 0} for d in days}
        for r in rows:
            d = r['created_at'][:10]
            if d in daily:
                daily[d][r['auto_action']] += 1

        return {
            'total': total,
            'status': {k: status.get(k, 0) for k in ('allowed', 'pending', 'removed', 'approved')},
            'auto_actions': {k: auto.get(k, 0) for k in ('allow', 'review', 'remove')},
            'rules': dict(rules),
            'by_language': by_lang,
            'human_reviewed': len(human),
            'agreement': (agree / len(human)) if human else None,
            'median_decision_seconds': statistics.median(waits) if waits else None,
            'top_words': [{'word': w, 'language': l, 'count': c} for (w, l), c in words.most_common(12)],
            'daily': list(daily.values()),
            'active_policy': dict(policy) if policy else None,
        }

    @router.get('/audit')
    def audit_log(limit: int = Query(100, ge=1, le=1000)):
        with connect() as conn:
            out = []
            for r in conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)):
                d = dict(r)
                d['detail'] = json.loads(d['detail'])
                out.append(d)
            return out

    @router.get('/export.csv')
    def export_csv():
        cols = ['id', 'created_at', 'decided_at', 'language', 'author', 'source', 'text', 'p_abusive',
                'policy_name', 'auto_action', 'rule', 'status', 'decided_by', 'category', 'final_reason']
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        with connect() as conn:
            for r in conn.execute("SELECT * FROM items ORDER BY id"):
                w.writerow([r[c] for c in cols])
        return Response('﻿' + buf.getvalue(), media_type='text/csv; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="fairmod-decisions.csv"'})

    return router
