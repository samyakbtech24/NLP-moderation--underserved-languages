"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL, type Action, type Status } from "@/lib/console";

export function PageHeader({
  title,
  lead,
  actions,
  kicker,
  accent = "var(--sun)",
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  kicker?: string;
  accent?: string;
}) {
  return (
    <header className="reveal mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-9">
      <div className="max-w-2xl">
        {kicker && (
          <span className="nb-sticker mb-3" style={{ background: accent }}>
            {kicker}
          </span>
        )}
        <h1 className="display text-[clamp(2.2rem,5vw,3.4rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
          {title}
        </h1>
        {lead && <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--ink-soft)] md:text-base">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}

const TONE = {
  bad: "var(--coral-soft)",
  good: "var(--mint-soft)",
  warn: "var(--amber-soft)",
  muted: "var(--card)",
  violet: "var(--violet-soft)",
};

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className="nb-tag" style={{ background: TONE[tone] }}>
      {children}
    </span>
  );
}

const STATUS_ICON: Record<Status, string> = { removed: "✕", pending: "◷", allowed: "✓", approved: "✓" };

export function StatusBadge({ status }: { status: Status }) {
  const tone = status === "removed" ? "bad" : status === "pending" ? "warn" : "good";
  return (
    <Badge tone={tone}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function ActionBadge({ action }: { action: Action }) {
  const tone = action === "remove" ? "bad" : action === "review" ? "warn" : "good";
  const label = action === "remove" ? "Auto-removed" : action === "review" ? "Sent to review" : "Auto-allowed";
  return <Badge tone={tone}>⚙ {label}</Badge>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="nb-card reveal flex items-start gap-3 !bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium" role="alert">
      <span className="nb-tag !bg-[var(--coral)] !text-white">ERROR</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function RiskMeter({ value }: { value: number }) {
  const color = value >= 0.5 ? "var(--coral)" : "var(--mint)";
  return (
    <span className="inline-flex items-center gap-2 font-bold tabular-nums">
      <span className="h-3 w-14 overflow-hidden rounded border-2 border-[var(--ink)] bg-[var(--paper)]" aria-hidden>
        <span className="block h-full" style={{ width: `${Math.max(4, value * 100)}%`, background: color }} />
      </span>
      {(value * 100).toFixed(1)}%
    </span>
  );
}

export const btn = {
  primary: "nb-btn nb-btn--ink",
  secondary: "nb-btn",
  danger: "nb-btn nb-btn--coral",
  good: "nb-btn nb-btn--mint",
  sun: "nb-btn nb-btn--sun",
};

export const field = "nb-input";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="nb-card reveal relative flex min-h-[200px] flex-col justify-center overflow-hidden bg-[var(--violet-soft)] p-7">
      <span className="nb-sticker absolute right-5 top-5 bg-[var(--sun)]" aria-hidden>
        empty
      </span>
      <p className="display text-3xl font-extrabold">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm font-medium leading-relaxed">{children}</div>}
    </div>
  );
}

/** Small card with an ink header bar — used for sections across console pages. */
export function Panel({
  title,
  accent = "var(--sun)",
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  accent?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`nb-card overflow-hidden ${className}`}>
      <div
        className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] px-4 py-2.5"
        style={{ background: accent }}
      >
        <h2 className="text-sm font-extrabold uppercase tracking-[0.1em]">{title}</h2>
        {actions}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}
