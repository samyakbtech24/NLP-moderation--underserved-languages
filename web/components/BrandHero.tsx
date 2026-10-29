"use client";

import Link from "next/link";
import { ModeSwitch } from "./ModeSwitch";
import type { WorkspaceMode } from "@/lib/types";

type Props = {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  apiOnline: boolean | null;
};

// Fig. 1 — a real output of the fine-tuned model (IG, normalised), not a mock-up.
const SPECIMEN = {
  words: [
    { w: "তুই", s: 0.505 },
    { w: "একটা", s: 0.306 },
    { w: "আস্ত", s: 0.341 },
    { w: "গাধা,", s: 1.0 },
    { w: "চুপ", s: 0.24 },
    { w: "কর।", s: -0.16 },
  ],
  p: 0.872,
  gloss: "“You're a complete donkey, shut up.” — Bengali",
};

// Table I — test macro-F1 (results/table_I.csv).
const TABLE_I = [
  { lang: "Hindi", script: "हिंदी", f1: 0.8624 },
  { lang: "Kannada", script: "ಕನ್ನಡ", f1: 0.8581 },
  { lang: "Marathi", script: "मराठी", f1: 0.91 },
  { lang: "Bengali", script: "বাংলা", f1: 0.8995 },
];

export function BrandHero({ mode, onModeChange, apiOnline }: Props) {
  return (
    <section className="border-b-[3px] border-[var(--ink)] bg-[var(--card)]">
      {/* masthead rule */}
      <div className="border-b-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 text-[0.68rem] font-bold uppercase tracking-[0.2em] sm:px-6 lg:px-8">
          <span>No. 01 · NLP for underserved languages</span>
          <span className="hidden sm:inline">Hindi · Kannada · Marathi · Bengali</span>
          <StatusLine online={apiOnline} />
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:py-14 lg:grid-cols-12 lg:gap-10 lg:px-8">
        {/* left: title + abstract */}
        <div className="reveal lg:col-span-7">
          <h1 className="display text-[clamp(3.2rem,11vw,7.5rem)] font-extrabold leading-[0.82] tracking-[-0.05em]">
            Fair<span className="text-[var(--red)]">Mod</span>
            <span className="caret" aria-hidden />
          </h1>
          <p className="mt-5 max-w-xl border-l-[6px] border-[var(--red)] pl-4 text-lg font-bold leading-snug md:text-xl">
            An explainable abusive-comment classifier for four Indian languages — every verdict comes with the
            words that caused it.
          </p>

          <div className="mt-7 grid max-w-xl gap-4 sm:grid-cols-[auto_1fr]">
            <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-[var(--red)]">Abstract</p>
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              One multilingual model (MuRIL, fine-tuned on 97,793 comments) replaces four monolingual ones. Integrated
              Gradients attributes each decision to whole words — including Indic vowel signs a regex would split —
              in about a third of a second on a CPU, so a moderator can check the machine instead of trusting it.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ModeSwitch mode={mode} onChange={onModeChange} />
            <Link href="/evaluate" className="nb-btn nb-btn--red">
              Run the evaluation bench →
            </Link>
          </div>
        </div>

        {/* right: Fig. 1 + Table I */}
        <div className="stagger space-y-6 lg:col-span-5">
          <figure className="nb-card overflow-hidden">
            <div className="flex items-center justify-between border-b-[3px] border-[var(--ink)] px-4 py-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em]">
              <span>Fig. 1 — real model output</span>
              <span className="text-[var(--red)]">P(abusive) {Math.round(SPECIMEN.p * 100)}%</span>
            </div>
            <p className="indic px-4 pb-2 pt-4 text-2xl leading-[2.1]">
              {SPECIMEN.words.map((x, i) => (
                <span key={x.w}>
                  {i > 0 ? " " : null}
                  <span
                    className={`word-hl ${x.s >= 0.5 ? "is-hot font-bold" : ""}`}
                    style={{
                      backgroundColor:
                        x.s > 0
                          ? `color-mix(in srgb, var(--coral) ${Math.round(14 + x.s * 66)}%, transparent)`
                          : `color-mix(in srgb, var(--mint) ${Math.round(12 + -x.s * 50)}%, transparent)`,
                      animationDelay: `${300 + i * 90}ms`,
                    }}
                  >
                    {x.w}
                  </span>
                </span>
              ))}
            </p>
            <figcaption className="border-t-2 border-dashed border-[var(--ink)] px-4 py-2.5 text-xs text-[var(--ink-muted)]">
              {SPECIMEN.gloss} Darker red = pushed harder toward <b className="text-[var(--ink)]">abusive</b>; gray =
              toward normal.
            </figcaption>
          </figure>

          <div className="nb-card overflow-hidden">
            <div className="border-b-[3px] border-[var(--ink)] px-4 py-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em]">
              Table I — test macro-F1, MuRIL
            </div>
            <ul className="divide-y-2 divide-[var(--ink)]">
              {TABLE_I.map((r, i) => (
                <li key={r.lang} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 px-4 py-2 text-sm">
                  <span className="font-bold">
                    {r.lang} <span className="indic block text-[0.7rem] font-medium text-[var(--ink-muted)]">{r.script}</span>
                  </span>
                  <span className="h-3.5 overflow-hidden rounded border-2 border-[var(--ink)] bg-[var(--paper)]">
                    {/* axis starts at 0.80 so differences are visible; labelled below */}
                    <span
                      className="bar-fill block h-full bg-[var(--ink)]"
                      style={{ width: `${((r.f1 - 0.8) / 0.12) * 100}%`, animationDelay: `${400 + i * 80}ms` }}
                    />
                  </span>
                  <span className="text-right font-extrabold tabular-nums">{r.f1.toFixed(3)}</span>
                </li>
              ))}
            </ul>
            <p className="border-t-[3px] border-[var(--ink)] px-4 py-2 text-[0.7rem] text-[var(--ink-muted)]">
              Overall 0.876 · beats XLM-R (0.873) and TF-IDF (0.858) in every language. Bars start at 0.80.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusLine({ online }: { online: boolean | null }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      {online ? (
        <span className="live-dot" aria-hidden />
      ) : (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--paper)]"
          style={{ background: online === false ? "var(--red)" : "transparent" }}
          aria-hidden
        />
      )}
      {online === null ? "Checking model" : online ? "Model online" : "Model offline"}
    </span>
  );
}
