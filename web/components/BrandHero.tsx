"use client";

import Link from "next/link";
import { ModeSwitch } from "./ModeSwitch";
import type { WorkspaceMode } from "@/lib/types";

type Props = {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  apiOnline: boolean | null;
};

const SCRIPTS = [
  { text: "हिंदी", bg: "var(--sun)", r: "-8deg", pos: "left-[4%] top-[18%]" },
  { text: "ಕನ್ನಡ", bg: "var(--pink)", r: "6deg", pos: "right-[6%] top-[12%]" },
  { text: "मराठी", bg: "var(--sky)", r: "5deg", pos: "left-[10%] bottom-[10%]" },
  { text: "বাংলা", bg: "var(--violet-soft)", r: "-6deg", pos: "right-[12%] bottom-[14%]" },
];

const TICKER = [
  "4 languages · 1 model",
  "macro-F1 0.876 on held-out test",
  "word-level reasons via Integrated Gradients",
  "~350 ms per explanation on CPU",
  "97,793 training comments",
  "MuRIL beats XLM-R and TF-IDF in every language",
];

export function BrandHero({ mode, onModeChange, apiOnline }: Props) {
  return (
    <header>
      <nav className="border-b-[3px] border-[var(--ink)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="display grid h-9 w-9 place-items-center rounded-lg border-[3px] border-[var(--ink)] bg-[var(--coral)] text-lg font-extrabold text-white shadow-[2px_2px_0_0_var(--ink)]">
              F
            </span>
            <span className="display text-2xl font-extrabold tracking-tight">FairMod</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill online={apiOnline} />
            <Link href="/console" className="nb-btn nb-btn--ink nb-btn--sm">
              Moderation console →
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b-[3px] border-[var(--ink)] bg-[var(--sun)]">
        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden>
          {SCRIPTS.map((s, i) => (
            <span
              key={s.text}
              className={`indic float absolute rounded-xl border-[3px] border-[var(--ink)] px-4 py-1.5 text-2xl font-bold shadow-[4px_4px_0_0_var(--ink)] ${s.pos}`}
              style={{ background: s.bg, ["--r" as string]: s.r, animationDelay: `${i * 0.7}s` }}
            >
              {s.text}
            </span>
          ))}
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-12 text-center sm:px-6 md:py-16 lg:px-8">
          <span className="nb-sticker mb-5 bg-[var(--card)]">Research prototype</span>
          <h1 className="display max-w-3xl text-[clamp(2.4rem,7vw,4.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
            Catch abuse in four Indian languages.{" "}
            <span className="relative inline-block whitespace-nowrap">
              <span className="relative z-10">See why.</span>
              <span className="absolute inset-x-[-4px] bottom-[6%] -z-0 h-[38%] -rotate-1 rounded bg-[var(--coral)]" aria-hidden />
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-relaxed md:text-lg">
            Hindi, Kannada, Marathi and Bengali — with the exact words behind every verdict highlighted, so a human can check
            the machine.
          </p>
          <div className="mt-7">
            <ModeSwitch mode={mode} onChange={onModeChange} />
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden>
        <div className="marquee__track py-2.5 text-sm font-bold">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-6 px-6 whitespace-nowrap">
              {t}
              <span className="text-[var(--sun)]">✦</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function StatusPill({ online }: { online: boolean | null }) {
  const label = online === null ? "Checking API" : online ? "API online" : "API offline";
  return (
    <span className="nb-tag" role="status">
      {online ? (
        <span className="live-dot" aria-hidden />
      ) : (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--ink)]"
          style={{ background: online === false ? "var(--coral)" : "var(--paper-deep)" }}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}
