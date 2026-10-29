import { ApiError } from "./api";
import { parseCsv } from "./csv";
import { SAMPLE_FEED } from "./sample-feed";
import type { WordScore } from "./types";

export type Label = 0 | 1; // 1 = abusive, 0 = normal

export type EvalItem = { id?: string | number; text: string; label: Label | null; language?: string | null };

export type EvalResult = {
  id?: string | number | null;
  text: string;
  language: string;
  expected: Label | null;
  predicted: Label;
  p_abusive: number;
  confidence: number;
  correct: boolean | null;
  word_scores: WordScore[] | null;
  latency_ms: number;
};

type ClassBlock = { precision: number; recall: number; f1: number; support: number };
export type Block = {
  n: number;
  accuracy: number;
  macro_f1: number;
  abusive: ClassBlock;
  normal: ClassBlock;
  confusion: { tp: number; tn: number; fp: number; fn: number };
};
export type Metrics = Block & {
  total: number;
  unlabelled: number;
  by_language: Record<string, Block>;
  mean_confidence_correct: number | null;
  mean_confidence_wrong: number | null;
  mean_latency_ms: number | null;
};

export type SavedRun = { id: number; name: string; source: string; created_at: string; n: number; metrics: Metrics };

export type Dataset = { name: string; total: number; languages: Record<string, { abusive: number; normal: number }> };

// ─── API ─────────────────────────────────────────────────────────────────

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/eval/${path}`, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    try {
      const d = await res.json();
      msg = typeof d?.detail === "string" ? d.detail : typeof d?.error === "string" ? d.error : msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export const evalApi = {
  datasets: () => call<Dataset>("datasets"),
  sample: (perCell: number, languages: string[], seed: number) =>
    call<{ items: { id: string; text: string; label: Label; language: string }[] }>(
      `sample?per_cell=${perCell}&languages=${languages.join(",")}&seed=${seed}`,
    ),
  predict: (items: EvalItem[], explain: boolean, signal?: AbortSignal) =>
    call<{ results: EvalResult[] }>("predict", { method: "POST", body: JSON.stringify({ items, explain }), signal }),
  saveRun: (name: string, source: string, results: EvalResult[]) =>
    call<{ id: number; metrics: Metrics }>("runs", { method: "POST", body: JSON.stringify({ name, source, results }) }),
  runs: () => call<SavedRun[]>("runs"),
  run: (id: number) => call<SavedRun & { results: EvalResult[] }>(`runs/${id}`),
  deleteRun: (id: number) => call<{ deleted: number }>(`runs/${id}`, { method: "DELETE" }),
};

// ─── Labels & inputs ─────────────────────────────────────────────────────

const ABUSIVE = new Set(["1", "abusive", "hate", "hateful", "offensive", "toxic", "yes", "true", "abuse", "flagged"]);
const NORMAL = new Set(["0", "normal", "not", "none", "clean", "no", "false", "non-hate", "not_offensive", "neutral"]);

export function parseLabel(v: unknown): Label | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (ABUSIVE.has(s)) return 1;
  if (NORMAL.has(s)) return 0;
  return null;
}

export const labelName = (l: Label | null) => (l === 1 ? "abusive" : l === 0 ? "normal" : "—");

/** The 32 hand-written demo sentences: they alternate normal / abusive, 4 + 4 per language. */
export const CURATED: EvalItem[] = SAMPLE_FEED.map((x, i) => ({
  id: `curated-${i}`,
  text: x.text,
  label: i % 2 === 1 ? 1 : 0,
}));

export function itemsFromCsv(raw: string): EvalItem[] {
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ti = header.findIndex((h) => h === "text" || h === "comment" || h === "sentence");
  const li = header.findIndex((h) => h === "label" || h === "expected" || h === "gold" || h === "class");
  const gi = header.findIndex((h) => h === "language" || h === "lang");
  if (ti < 0) throw new Error("CSV needs a 'text' column.");
  if (li < 0) throw new Error("CSV needs a 'label' column (abusive / normal or 1 / 0).");
  return rows
    .slice(1)
    .filter((r) => (r[ti] ?? "").trim())
    .slice(0, 2000)
    .map((r, i) => ({ id: `csv-${i}`, text: r[ti].trim(), label: parseLabel(r[li]), language: gi >= 0 ? r[gi]?.trim() || null : null }));
}

/** One item per line: "abusive | text", "normal | text", "1, text" or "0<TAB>text". */
export function itemsFromPaste(raw: string): EvalItem[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2000)
    .map((line, i) => {
      const m = line.match(/^([^|,\t]+)\s*[|,\t]\s*(.+)$/);
      const label = m ? parseLabel(m[1]) : null;
      return { id: `paste-${i}`, text: label === null || !m ? line : m[2].trim(), label };
    });
}

// ─── Metrics (mirrors evaluation.compute_metrics) ────────────────────────

const f1 = (p: number, r: number) => (p + r ? (2 * p * r) / (p + r) : 0);

function block(rows: EvalResult[]): Block {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const r of rows) {
    if (r.expected === 1 && r.predicted === 1) tp++;
    else if (r.expected === 0 && r.predicted === 0) tn++;
    else if (r.expected === 0 && r.predicted === 1) fp++;
    else if (r.expected === 1 && r.predicted === 0) fn++;
  }
  const n = rows.length;
  const p1 = tp + fp ? tp / (tp + fp) : 0, r1 = tp + fn ? tp / (tp + fn) : 0;
  const p0 = tn + fn ? tn / (tn + fn) : 0, r0 = tn + fp ? tn / (tn + fp) : 0;
  const fa = f1(p1, r1), fnm = f1(p0, r0);
  return {
    n,
    accuracy: n ? (tp + tn) / n : 0,
    macro_f1: n ? (fa + fnm) / 2 : 0,
    abusive: { precision: p1, recall: r1, f1: fa, support: tp + fn },
    normal: { precision: p0, recall: r0, f1: fnm, support: tn + fp },
    confusion: { tp, tn, fp, fn },
  };
}

export function computeMetrics(results: EvalResult[]): Metrics {
  const scored = results.filter((r) => r.expected !== null);
  const langs = [...new Set(scored.map((r) => r.language || "other"))].sort();
  const right = scored.filter((r) => r.correct).map((r) => r.confidence);
  const wrong = scored.filter((r) => r.correct === false).map((r) => r.confidence);
  const lat = results.map((r) => r.latency_ms).filter(Boolean);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    ...block(scored),
    total: results.length,
    unlabelled: results.length - scored.length,
    by_language: Object.fromEntries(langs.map((l) => [l, block(scored.filter((r) => (r.language || "other") === l))])),
    mean_confidence_correct: mean(right),
    mean_confidence_wrong: mean(wrong),
    mean_latency_ms: mean(lat),
  };
}

// ─── Export ──────────────────────────────────────────────────────────────

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsv(results: EvalResult[], name = "fairmod-evaluation.csv") {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ["text,language,expected,predicted,p_abusive,confidence,correct,top_words"];
  for (const r of results) {
    const top = (r.word_scores ?? [])
      .filter((w) => (w.score ?? 0) > 0.25)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 3)
      .map((w) => w.word)
      .join(" ");
    lines.push(
      [q(r.text), r.language, labelName(r.expected), labelName(r.predicted), r.p_abusive, r.confidence, r.correct ?? "", q(top)].join(","),
    );
  }
  download(name, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
}

export function exportJson(results: EvalResult[], metrics: Metrics, name = "fairmod-evaluation.json") {
  download(name, JSON.stringify({ metrics, results }, null, 2), "application/json");
}
