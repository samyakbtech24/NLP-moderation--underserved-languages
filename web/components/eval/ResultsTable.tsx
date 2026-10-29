"use client";

import { useMemo, useState } from "react";
import { scoreColor } from "@/components/HighlightedText";
import { LANG_NAMES } from "@/lib/console";
import { labelName, type EvalResult } from "@/lib/eval";

type Filter = "all" | "correct" | "wrong" | "fp" | "fn";
type Sort = "order" | "confident-wrong" | "least-confident" | "most-abusive";

const FILTERS: { id: Filter; label: string; test: (r: EvalResult) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "correct", label: "✓ Correct", test: (r) => r.correct === true },
  { id: "wrong", label: "✗ Wrong", test: (r) => r.correct === false },
  { id: "fp", label: "False positives", test: (r) => r.expected === 0 && r.predicted === 1 },
  { id: "fn", label: "False negatives", test: (r) => r.expected === 1 && r.predicted === 0 },
];

const PAGE = 40;

export function ResultsTable({ results, newestFirst }: { results: EvalResult[]; newestFirst: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState<Sort>("order");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    let out = results.map((r, i) => ({ r, i })).filter(({ r }) => f.test(r) && (!lang || r.language === lang));
    if (q.trim()) out = out.filter(({ r }) => r.text.toLowerCase().includes(q.trim().toLowerCase()));
    if (sort === "confident-wrong") out.sort((a, b) => Number(a.r.correct) - Number(b.r.correct) || b.r.confidence - a.r.confidence);
    else if (sort === "least-confident") out.sort((a, b) => a.r.confidence - b.r.confidence);
    else if (sort === "most-abusive") out.sort((a, b) => b.r.p_abusive - a.r.p_abusive);
    else if (newestFirst) out.reverse();
    return out;
  }, [results, filter, lang, sort, q, newestFirst]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, results.filter(f.test).length])), [results]);
  const langs = useMemo(() => [...new Set(results.map((r) => r.language))].sort(), [results]);

  return (
    <section className="nb-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setShown(PAGE);
            }}
            className={`nb-btn nb-btn--sm ${filter === f.id ? "nb-btn--ink" : ""}`}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.id]}</span>
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-[3px] bg-[var(--ink)] md:block" aria-hidden />
        <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="nb-input !w-auto !py-1 text-sm">
          <option value="">All languages</option>
          {langs.map((l) => (
            <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="nb-input !w-auto !py-1 text-sm">
          <option value="order">{newestFirst ? "Newest first" : "Input order"}</option>
          <option value="confident-wrong">Confidently wrong first</option>
          <option value="least-confident">Least confident first</option>
          <option value="most-abusive">Highest P(abusive)</option>
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search text…"
          className="nb-input indic !w-auto min-w-[10rem] flex-1 !py-1 text-sm"
        />
      </div>

      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_7rem_7rem_8.5rem_3rem] gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-[var(--paper)] md:grid">
        <span>#</span>
        <span>Sentence · words coloured by influence</span>
        <span>Original</span>
        <span>FairMod</span>
        <span>Confidence</span>
        <span className="text-center">✓/✗</span>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm font-bold text-[var(--ink-muted)]">Nothing matches this filter.</p>
      ) : (
        <ul>
          {rows.slice(0, shown).map(({ r, i }) => (
            <Row key={`${i}-${r.id ?? ""}`} r={r} index={i + 1} />
          ))}
        </ul>
      )}

      {rows.length > shown && (
        <div className="border-t-[3px] border-[var(--ink)] p-3 text-center">
          <button type="button" className="nb-btn nb-btn--sm" onClick={() => setShown((s) => s + PAGE)}>
            Show {Math.min(PAGE, rows.length - shown)} more · {rows.length - shown} hidden
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ r, index }: { r: EvalResult; index: number }) {
  const wrong = r.correct === false;
  return (
    <li
      className={`pop-num grid gap-3 border-b-2 border-[var(--ink)] px-4 py-3 last:border-b-0 md:grid-cols-[3rem_minmax(0,1fr)_7rem_7rem_8.5rem_3rem] md:items-center ${
        wrong ? "bg-[var(--coral-soft)]" : ""
      }`}
    >
      <span className="text-xs font-extrabold tabular-nums text-[var(--ink-muted)]">
        #{index}
        <span className="mt-0.5 block font-bold uppercase">{r.language}</span>
      </span>

      <p className="indic min-w-0 text-base leading-[1.9]">
        {r.word_scores
          ? r.word_scores.map((w, k) => (
              <span key={k}>
                {k > 0 ? " " : null}
                <span
                  className={`rounded px-[3px] ${w.score !== null && Math.abs(w.score) >= 0.5 ? "font-bold outline-2 outline-[var(--ink)]" : ""}`}
                  style={{ backgroundColor: scoreColor(w.score) }}
                  title={w.score === null ? "not seen by the model" : `IG ${w.score.toFixed(3)}`}
                >
                  {w.word}
                </span>
              </span>
            ))
          : r.text}
      </p>

      <span className="flex items-center gap-2 md:block">
        <span className="text-[0.62rem] font-extrabold uppercase text-[var(--ink-muted)] md:hidden">Original</span>
        <Verdict label={r.expected} />
      </span>
      <span className="flex items-center gap-2 md:block">
        <span className="text-[0.62rem] font-extrabold uppercase text-[var(--ink-muted)] md:hidden">FairMod</span>
        <Verdict label={r.predicted} />
      </span>

      <span className="text-sm">
        <span className="font-extrabold tabular-nums">{(r.confidence * 100).toFixed(1)}%</span>
        <span className="mt-1 flex items-center gap-1.5 text-[0.65rem] font-bold text-[var(--ink-muted)]">
          <span className="h-2.5 w-14 overflow-hidden rounded border-2 border-[var(--ink)] bg-[var(--paper)]">
            <span
              className="block h-full"
              style={{ width: `${r.p_abusive * 100}%`, background: r.p_abusive >= 0.5 ? "var(--coral)" : "var(--mint)" }}
            />
          </span>
          P(ab) {(r.p_abusive * 100).toFixed(0)}%
        </span>
      </span>

      <span className="md:text-center">
        {r.correct === null ? (
          <span className="nb-tag">n/a</span>
        ) : (
          <span
            className={`stamp inline-grid h-9 w-9 place-items-center rounded-lg border-[3px] border-[var(--ink)] text-lg font-extrabold ${
              r.correct ? "bg-[var(--card)]" : "bg-[var(--red)] text-[var(--on-red)]"
            }`}
            aria-label={r.correct ? "correct" : "wrong"}
          >
            {r.correct ? "✓" : "✗"}
          </span>
        )}
      </span>
    </li>
  );
}

function Verdict({ label }: { label: 0 | 1 | null }) {
  if (label === null) return <span className="nb-tag">unlabelled</span>;
  return (
    <span
      className="nb-tag uppercase"
      style={label === 1 ? { background: "var(--coral)", color: "var(--card)" } : { background: "var(--mint-soft)" }}
    >
      {labelName(label)}
    </span>
  );
}
