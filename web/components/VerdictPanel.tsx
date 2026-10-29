"use client";

import { useCountUp } from "@/lib/useCountUp";
import type { ClassifyResponse, HighlightFilter } from "@/lib/types";
import { HighlightedText } from "./HighlightedText";

type Props = {
  result: ClassifyResponse;
  filter: HighlightFilter;
  onFilterChange: (f: HighlightFilter) => void;
};

export function VerdictPanel({ result, filter, onFilterChange }: Props) {
  const isAbusive = result.label.toLowerCase() === "abusive";
  const abusiveP = result.probabilities.abusive ?? 0;
  const normalP = result.probabilities.normal ?? 0;
  const confidence = useCountUp(result.confidence * 100);

  return (
    <section className="nb-card reveal overflow-hidden" aria-live="polite">
      <div
        className="relative flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-[var(--ink)] px-5 py-6 md:px-6"
        style={{ background: isAbusive ? "var(--coral)" : "var(--mint)" }}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/90">Verdict</p>
          <p
            key={result.label + result.latency_ms}
            className="stamp display mt-2 inline-block rounded-xl border-[3px] border-[var(--ink)] bg-[var(--card)] px-4 py-1 text-4xl font-extrabold uppercase tracking-tight shadow-[4px_4px_0_0_var(--ink)] md:text-5xl"
            style={{ color: isAbusive ? "var(--coral-ink)" : "var(--mint-ink)" }}
          >
            {result.label}
          </p>
        </div>
        <div className="rounded-xl border-[3px] border-[var(--ink)] bg-[var(--sun)] px-4 py-2 text-right shadow-[4px_4px_0_0_var(--ink)]">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em]">Confidence</p>
          <p className="display text-3xl font-extrabold tabular-nums">{confidence.toFixed(1)}%</p>
        </div>
      </div>

      <div className="space-y-6 p-5 md:p-6">
        <div className="space-y-3">
          <ProbBar label="Abusive" value={abusiveP} tone="abusive" />
          <ProbBar label="Normal" value={normalP} tone="normal" />
        </div>

        <HighlightedText words={result.word_scores} filter={filter} onFilterChange={onFilterChange} />

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="nb-tag bg-[var(--violet-soft)]">⚡ {Math.round(result.latency_ms)} ms</span>
          <span className="nb-tag">Integrated Gradients</span>
          {result.truncated && (
            <p className="w-full rounded-lg border-2 border-[var(--ink)] bg-[var(--amber-soft)] px-3 py-2">
              Long comment: only the first 128 tokens were read. Unhighlighted words at the end were not seen by the
              model.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProbBar({ label, value, tone }: { label: string; value: number; tone: "abusive" | "normal" }) {
  const color = tone === "abusive" ? "var(--coral)" : "var(--mint)";
  const shown = useCountUp(value * 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm font-bold">
        <span>{label}</span>
        <span className="tabular-nums">{shown.toFixed(1)}%</span>
      </div>
      <div className="h-5 overflow-hidden rounded-lg border-[3px] border-[var(--ink)] bg-[var(--paper)]">
        <div
          className="bar-fill h-full border-r-[3px] border-[var(--ink)]"
          style={{ width: `${Math.max(2, value * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function VerdictSkeleton() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="skeleton h-28 w-full" />
      <div className="skeleton h-5 w-full" />
      <div className="skeleton h-5 w-full" />
      <div className="skeleton h-32 w-full" />
    </section>
  );
}
