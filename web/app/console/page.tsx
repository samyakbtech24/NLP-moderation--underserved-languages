"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorBox, PageHeader, Panel, btn } from "@/components/console/ui";
import { LANG_NAMES, formatDuration, mod, timeAgo, type Analytics, type AuditEvent } from "@/lib/console";
import { useCountUp } from "@/lib/useCountUp";

// Status colours validated with the dataviz palette checker (see globals.css).
const ACTION = {
  allow: { color: "var(--mint)", label: "Allowed" },
  review: { color: "var(--amber)", label: "Review" },
  remove: { color: "var(--coral)", label: "Removed" },
} as const;
const KEYS = ["allow", "review", "remove"] as const;

export default function DashboardPage() {
  const [a, setA] = useState<Analytics | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([mod.analytics(), mod.audit(8)])
        .then(([an, ev]) => {
          setA(an);
          setEvents(ev);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load analytics."));
    void load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, []);

  if (error && !a) return <ErrorBox>{error}</ErrorBox>;
  if (!a)
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    );

  if (a.total === 0) {
    return (
      <>
        <PageHeader title="Dashboard" kicker="Live" />
        <EmptyState title="No content processed yet">
          <p>
            Head to{" "}
            <Link href="/console/ingest" className="font-bold underline underline-offset-2">
              Ingest
            </Link>{" "}
            and load the demo stream to watch the console light up.
          </p>
        </EmptyState>
      </>
    );
  }

  const automated = a.auto_actions.allow + a.auto_actions.remove;
  const langs = Object.entries(a.by_language).sort((x, y) => y[1].total - x[1].total);
  const maxDay = Math.max(1, ...a.daily.map((d) => d.allow + d.review + d.remove));

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="● Live"
        accent="var(--mint-soft)"
        lead={
          <>
            Everything flowing through the pipeline under policy{" "}
            <Link
              href="/console/policies"
              className="rounded-md border-2 border-[var(--ink)] bg-[var(--violet-soft)] px-1.5 font-bold hover:bg-[var(--red)] hover:text-white"
            >
              {a.active_policy?.name}
            </Link>
            . Refreshes every 15 seconds.
          </>
        }
        actions={
          a.status.pending > 0 ? (
            <Link href="/console/queue" className={`${btn.danger} wiggle-hover`}>
              Review {a.status.pending} pending →
            </Link>
          ) : undefined
        }
      />

      <section className="stagger grid grid-cols-2 gap-4 md:grid-cols-3">
        <Kpi label="Items processed" value={a.total} bg="var(--sun)" />
        <Kpi label="Handled automatically" value={(automated / a.total) * 100} suffix="%" sub={`${automated} with no human`} bg="var(--sky)" />
        <Kpi label="Removed" value={a.status.removed} sub={`${pct(a.status.removed / a.total)} of all items`} bg="var(--coral-soft)" />
        <Kpi label="Waiting for review" value={a.status.pending} sub={a.status.pending ? "needs a human" : "queue clear"} bg="var(--amber-soft)" />
        <Kpi
          label="Model ↔ moderator agreement"
          value={a.agreement == null ? null : a.agreement * 100}
          suffix="%"
          sub={`${a.human_reviewed} human decision${a.human_reviewed === 1 ? "" : "s"}`}
          bg="var(--violet-soft)"
        />
        <Kpi label="Median time to decision" text={formatDuration(a.median_decision_seconds)} sub="queued → decided" bg="var(--mint-soft)" />
      </section>

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <Panel title="Automated action by language" accent="var(--sky)" actions={<Legend />}>
          <ul className="space-y-4">
            {langs.map(([lang, d]) => (
              <li key={lang}>
                <div className="mb-1.5 flex justify-between text-sm font-bold">
                  <span>{LANG_NAMES[lang] ?? lang}</span>
                  <span className="tabular-nums text-[var(--ink-muted)]">
                    {d.total} items · {pct((d.review + d.remove) / d.total)} flagged
                  </span>
                </div>
                <StackBar parts={[d.allow, d.review, d.remove]} total={d.total} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Volume · last 14 days" accent="var(--pink)" actions={<Legend />}>
          <div className="flex h-44 items-end gap-1.5 border-b-[3px] border-[var(--ink)]" role="img" aria-label="Daily volume by action">
            {a.daily.map((d, i) => {
              const total = d.allow + d.review + d.remove;
              return (
                <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                  {total > 0 && (
                    <div
                      className="bar-rise flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-md border-[2.5px] border-b-0 border-[var(--ink)] bg-[var(--ink)] transition-transform group-hover:-translate-y-1"
                      style={{ height: `${(total / maxDay) * 100}%`, animationDelay: `${i * 30}ms` }}
                    >
                      {KEYS.map((k) => (d[k] ? <div key={k} style={{ flexGrow: d[k], background: ACTION[k].color }} /> : null))}
                    </div>
                  )}
                  <Tooltip>
                    <b>{d.date}</b> · {total} items
                    <br />
                    {KEYS.map((k) => `${ACTION[k].label} ${d[k]}`).join(" · ")}
                  </Tooltip>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.7rem] font-bold text-[var(--ink-muted)]">
            <span>{a.daily[0]?.date.slice(5)}</span>
            <span>today</span>
          </div>
        </Panel>

        <Panel title="Words most often behind removals" accent="var(--coral-soft)">
          {a.top_words.length === 0 ? (
            <p className="text-sm font-medium text-[var(--ink-muted)]">No removals yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {a.top_words.map((w, i) => (
                <li key={`${w.word}-${w.language}`} className="flex items-center gap-3 text-sm">
                  <span className="indic w-28 shrink-0 truncate text-base font-bold">{w.word}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded-md border-2 border-[var(--ink)] bg-[var(--paper)]">
                    <span
                      className="bar-fill block h-full border-r-2 border-[var(--ink)] bg-[var(--coral)]"
                      style={{ width: `${(w.count / a.top_words[0].count) * 100}%`, animationDelay: `${i * 40}ms` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums">
                    {w.count}× <span className="text-[var(--ink-muted)]">{w.language}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs font-medium text-[var(--ink-muted)]">
            From Integrated Gradients on removed items — candidates for the{" "}
            <Link href="/console/lists" className="font-bold text-[var(--ink)] underline underline-offset-2">
              blocklist
            </Link>
            , or a bias warning if a harmless word shows up.
          </p>
        </Panel>

        <Panel
          title="Recent activity"
          accent="var(--violet-soft)"
          actions={
            <Link href="/console/audit" className="nb-btn nb-btn--sm">
              Audit log →
            </Link>
          }
        >
          {events.length === 0 ? (
            <p className="text-sm font-medium text-[var(--ink-muted)]">No human actions yet.</p>
          ) : (
            <ul className="stagger space-y-2">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-sm"
                >
                  <span className="indic min-w-0 truncate">
                    <span className="font-bold">{e.actor}</span> <span>{e.event.replace(".", " ")}</span>{" "}
                    <span className="text-[var(--ink-muted)]">{e.target}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-[var(--ink-muted)]">{timeAgo(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function Kpi({
  label,
  value,
  text,
  suffix = "",
  sub,
  bg,
}: {
  label: string;
  value?: number | null;
  text?: string;
  suffix?: string;
  sub?: string;
  bg: string;
}) {
  const n = useCountUp(value ?? 0);
  const shown = text ?? (value == null ? "—" : `${Math.round(n).toLocaleString()}${suffix}`);
  return (
    <div className="nb-card nb-card--lift p-4 md:p-5" style={{ background: bg }}>
      <p className="text-[0.7rem] font-extrabold uppercase leading-snug tracking-[0.1em]">{label}</p>
      <p className="display mt-2 text-4xl font-extrabold tabular-nums md:text-5xl">{shown}</p>
      {sub && <p className="mt-1 text-xs font-bold text-[var(--ink-soft)]">{sub}</p>}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[0.7rem] font-bold">
      {KEYS.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm border-2 border-[var(--ink)]" style={{ background: ACTION[k].color }} aria-hidden />
          {ACTION[k].label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[14rem] -translate-x-1/2 rounded-lg border-2 border-[var(--ink)] bg-[var(--card)] px-2.5 py-1.5 text-[0.7rem] font-medium leading-snug shadow-[3px_3px_0_0_var(--ink)] group-hover:block"
    >
      {children}
    </span>
  );
}

function StackBar({ parts, total }: { parts: [number, number, number]; total: number }) {
  return (
    <div className="flex h-6 gap-[2px] rounded-lg border-[3px] border-[var(--ink)] bg-[var(--ink)]">
      {parts.map((n, i) =>
        n ? (
          <div
            key={KEYS[i]}
            className="bar-fill group relative flex h-full items-center justify-center text-[0.68rem] font-extrabold text-[var(--ink)] first:rounded-l-[5px] last:rounded-r-[5px]"
            style={{ width: `${(n / total) * 100}%`, background: ACTION[KEYS[i]].color, animationDelay: `${i * 80}ms` }}
          >
            {n / total >= 0.12 ? n : null}
            <Tooltip>
              {ACTION[KEYS[i]].label}: {n} of {total}
            </Tooltip>
          </div>
        ) : null,
      )}
    </div>
  );
}
