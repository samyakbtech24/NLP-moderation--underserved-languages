"use client";

import { useMemo, useState } from "react";
import type { HighlightFilter, WordScore } from "@/lib/types";

type Props = {
  words: WordScore[];
  filter: HighlightFilter;
  onFilterChange: (f: HighlightFilter) => void;
};

// Red = pushed toward abusive, gray = pushed toward normal. Theme-aware via CSS variables.
export function scoreColor(score: number | null): string {
  if (score === null) return "transparent";
  const t = Math.min(1, Math.abs(score));
  return score > 0
    ? `color-mix(in srgb, var(--coral) ${Math.round(14 + t * 66)}%, transparent)`
    : `color-mix(in srgb, var(--mint) ${Math.round(12 + t * 50)}%, transparent)`;
}

export function HighlightedText({ words, filter, onFilterChange }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const passes = useMemo(() => {
    return words.map((w) => {
      if (filter === "all" || w.score === null) return true;
      if (filter === "abusive") return (w.score ?? 0) > 0;
      return (w.score ?? 0) < 0;
    });
  }, [words, filter]);

  const shown = active !== null ? words[active] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="nb-label">Why — word by word</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Highlight filter">
          {(
            [
              { id: "all", label: "All" },
              { id: "abusive", label: "→ Abusive" },
              { id: "normal", label: "→ Normal" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => onFilterChange(f.id)}
              className={`nb-btn nb-btn--sm ${filter === f.id ? "nb-btn--ink" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p
        className="indic rounded-xl border-[3px] border-dashed border-[var(--ink)] bg-[var(--paper)] p-4 text-[1.15rem] leading-[2.1] md:text-xl"
        lang="und"
      >
        {words.map((w, i) => {
          const dim = !passes[i];
          const hot = w.score !== null && Math.abs(w.score) >= 0.5;
          return (
            <span key={`${i}-${w.word}`}>
              {i > 0 ? " " : null}
              <button
                type="button"
                className={`word-hl ${dim ? "is-dim" : ""} ${hot ? "is-hot font-bold" : ""}`}
                style={{
                  backgroundColor: scoreColor(w.score),
                  animationDelay: `${Math.min(i, 40) * 35}ms`,
                }}
                aria-label={
                  w.score === null ? `${w.word}, not seen by model` : `${w.word}, score ${w.score.toFixed(3)}`
                }
                onClick={() => setActive(active === i ? null : i)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {w.word}
              </button>
            </span>
          );
        })}
      </p>

      <div className="flex min-h-[2.75rem] flex-wrap items-center gap-3 text-xs font-bold" role="status">
        {shown ? (
          <span className="reveal inline-flex items-center gap-2 rounded-lg border-2 border-[var(--ink)] bg-[var(--card)] px-3 py-2 text-sm shadow-[2px_2px_0_0_var(--ink)]">
            <span className="indic text-base">{shown.word}</span>
            <span className="font-medium text-[var(--ink-muted)]">
              {shown.score === null
                ? "not seen (beyond the 128-token window)"
                : `IG ${shown.score > 0 ? "+" : ""}${shown.score.toFixed(3)} · ${
                    shown.score > 0 ? "pushed toward abusive" : shown.score < 0 ? "pushed toward normal" : "neutral"
                  }`}
            </span>
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border-2 border-[var(--ink)]" style={{ background: "var(--coral)" }} aria-hidden />
              Toward abusive
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border-2 border-[var(--ink)]" style={{ background: "var(--mint)" }} aria-hidden />
              Toward normal
            </span>
            <span className="font-medium text-[var(--ink-muted)]">Hover a word for its score</span>
          </>
        )}
      </div>
    </div>
  );
}
