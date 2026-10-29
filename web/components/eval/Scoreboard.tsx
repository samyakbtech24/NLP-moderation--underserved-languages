"use client";

import { LANG_NAMES } from "@/lib/console";
import type { Metrics } from "@/lib/eval";
import { useCountUp } from "@/lib/useCountUp";

const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);

export function Scoreboard({ m, running }: { m: Metrics; running: boolean }) {
  const c = m.confusion;
  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-4">
        <Big label="Macro-F1" value={m.macro_f1} hero running={running} />
        <Big label="Accuracy" value={m.accuracy} />
        <Big label="F1 · abusive" value={m.abusive.f1} />
        <Big label="F1 · normal" value={m.normal.f1} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="nb-card overflow-hidden">
          <Head title="Confusion matrix" note={`${m.n} scored`} />
          <div className="p-4 md:p-5">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-center text-xs font-extrabold uppercase tracking-[0.08em]">
              <span />
              <span className="pb-1">FairMod: abusive</span>
              <span className="pb-1">FairMod: normal</span>
              <span className="flex items-center justify-end pr-2 [writing-mode:vertical-rl] rotate-180 sm:[writing-mode:horizontal-tb] sm:rotate-0">
                Truth: abusive
              </span>
              <Cell n={c.tp} total={m.n} label="True positive" good />
              <Cell n={c.fn} total={m.n} label="False negative · missed" />
              <span className="flex items-center justify-end pr-2 [writing-mode:vertical-rl] rotate-180 sm:[writing-mode:horizontal-tb] sm:rotate-0">
                Truth: normal
              </span>
              <Cell n={c.fp} total={m.n} label="False positive · over-flag" />
              <Cell n={c.tn} total={m.n} label="True negative" good />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2.5 text-sm">
              <Mini label="Precision · abusive" v={pct(m.abusive.precision)} />
              <Mini label="Recall · abusive" v={pct(m.abusive.recall)} />
              <Mini label="Precision · normal" v={pct(m.normal.precision)} />
              <Mini label="Recall · normal" v={pct(m.normal.recall)} />
            </dl>
          </div>
        </section>

        <section className="nb-card overflow-hidden">
          <Head title="By language" note="macro-F1 bars start at 0" />
          <div className="overflow-x-auto">
            <table className="nb-table w-full min-w-[420px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">Language</th>
                  <th className="px-3 py-2.5 text-right">n</th>
                  <th className="px-3 py-2.5">Macro-F1</th>
                  <th className="px-3 py-2.5 text-right">Acc</th>
                  <th className="px-3 py-2.5 text-right" title="False positives">FP</th>
                  <th className="px-4 py-2.5 text-right" title="False negatives">FN</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.by_language).map(([lang, b]) => (
                  <tr key={lang}>
                    <td className="px-4 py-2.5 font-bold">{LANG_NAMES[lang] ?? lang}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.n}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-3.5 w-20 overflow-hidden rounded border-2 border-[var(--ink)] bg-[var(--paper)]">
                          <span className="block h-full bg-[var(--ink)] transition-[width] duration-500" style={{ width: `${b.macro_f1 * 100}%` }} />
                        </span>
                        <b className="tabular-nums">{b.macro_f1.toFixed(3)}</b>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(b.accuracy, 0)}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[var(--coral-ink)]">{b.confusion.fp}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-[var(--coral-ink)]">{b.confusion.fn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-2.5 border-t-[3px] border-[var(--ink)] p-4 text-sm">
            <Mini label="Mean confidence · right" v={pct(m.mean_confidence_correct)} />
            <Mini label="Mean confidence · wrong" v={pct(m.mean_confidence_wrong)} />
            <Mini label="Mean latency / item" v={m.mean_latency_ms == null ? "—" : `${Math.round(m.mean_latency_ms)} ms`} />
            <Mini label="Unlabelled (not scored)" v={String(m.unlabelled)} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Head({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[var(--paper)]">
      <h2 className="text-sm font-extrabold uppercase tracking-[0.1em]">{title}</h2>
      {note && <span className="text-[0.7rem] font-bold opacity-75">{note}</span>}
    </div>
  );
}

function Big({ label, value, hero, running }: { label: string; value: number; hero?: boolean; running?: boolean }) {
  const v = useCountUp(value * 100, 500);
  return (
    <div
      className={`nb-card relative overflow-hidden p-4 md:p-5 ${hero ? "bg-[var(--red)] text-[var(--on-red)]" : ""} ${hero && running ? "scanline" : ""}`}
    >
      <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">{label}</p>
      <p className="display mt-1 text-4xl font-extrabold tabular-nums md:text-5xl">
        {v.toFixed(1)}
        <span className="text-2xl">%</span>
      </p>
    </div>
  );
}

function Cell({ n, total, label, good }: { n: number; total: number; label: string; good?: boolean }) {
  const shown = useCountUp(n, 400);
  return (
    <div
      className="rounded-xl border-[3px] border-[var(--ink)] p-3 text-left shadow-[3px_3px_0_0_var(--ink)]"
      style={{ background: good ? "var(--card)" : "var(--coral-soft)" }}
    >
      <p className="display text-3xl font-extrabold tabular-nums normal-case tracking-normal md:text-4xl">{Math.round(shown)}</p>
      <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.06em]">{label}</p>
      <p className="text-[0.65rem] font-bold normal-case tracking-normal text-[var(--ink-muted)]">
        {total ? `${((n / total) * 100).toFixed(1)}% of items` : "—"}
      </p>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-lg border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2">
      <dt className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums">{v}</dd>
    </div>
  );
}
