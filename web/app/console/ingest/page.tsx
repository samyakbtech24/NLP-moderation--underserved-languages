"use client";

import Link from "next/link";
import { useState } from "react";
import { useConsole } from "@/components/console/ConsoleShell";
import { ItemDetail } from "@/components/console/ItemDetail";
import { ErrorBox, PageHeader, Panel, btn, field } from "@/components/console/ui";
import { ApiError, MAX_CHARS } from "@/lib/api";
import { mod, type BatchResult, type Item } from "@/lib/console";
import { textsFromCsv } from "@/lib/csv";
import { SAMPLE_FEED } from "@/lib/sample-feed";
import { useCountUp } from "@/lib/useCountUp";

const SOURCES = ["comments", "chat", "reviews", "posts"];

export default function IngestPage() {
  const { refresh, activePolicy } = useConsole();
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("comments");
  const [item, setItem] = useState<Item | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

  async function submitOne() {
    if (!text.trim()) return setError("Enter a comment first.");
    setError(null);
    setBatch(null);
    setBusy("one");
    try {
      setItem(await mod.moderate(text.trim(), author.trim() || "anonymous", source));
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function runBatch(rows: { text: string; author?: string; source?: string }[], label: string) {
    setError(null);
    setItem(null);
    setBusy(label);
    setProgress([0, rows.length]);
    try {
      const out: BatchResult = { items: [], skipped: 0, summary: { allow: 0, review: 0, remove: 0 } };
      // Small chunks so the progress bar moves; each item is explained (~0.3 s on CPU).
      for (let i = 0; i < rows.length; i += 8) {
        const r = await mod.batch(rows.slice(i, i + 8));
        out.items.push(...r.items);
        out.skipped += r.skipped;
        for (const k of ["allow", "review", "remove"] as const) out.summary[k] += r.summary[k];
        setProgress([Math.min(rows.length, i + 8), rows.length]);
      }
      setBatch(out);
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function onCsv(file: File) {
    try {
      const { texts } = textsFromCsv(await file.text());
      await runBatch(texts.slice(0, 500).map((t) => ({ text: t, source: "csv-import" })), "csv");
    } catch (e) {
      fail(e);
    }
  }

  return (
    <>
      <PageHeader
        title="Ingest"
        kicker="Pipeline"
        accent="var(--sky)"
        lead={
          <>
            Push content through the full pipeline: model + explanation → block / allow lists → the active policy (
            <b>{activePolicy?.name ?? "…"}</b>). In production your platform calls{" "}
            <code className="rounded border-2 border-[var(--ink)] bg-[var(--card)] px-1 text-xs font-bold">POST /mod/moderate</code>.
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <Panel title="Single item" accent="var(--violet-soft)">
            <div className="space-y-4">
              <textarea
                value={text}
                maxLength={MAX_CHARS}
                rows={4}
                onChange={(e) => setText(e.target.value)}
                placeholder="A comment in Hindi, Kannada, Marathi or Bengali…"
                className={`${field} indic resize-y text-base leading-relaxed`}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="nb-label">
                  Author handle
                  <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="anonymous" className={`${field} mt-1.5 normal-case tracking-normal`} />
                </label>
                <label className="nb-label">
                  Source
                  <select value={source} onChange={(e) => setSource(e.target.value)} className={`${field} mt-1.5 normal-case tracking-normal`}>
                    {SOURCES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className={btn.primary} disabled={!!busy} onClick={() => void submitOne()}>
                {busy === "one" ? "Moderating…" : "Moderate →"}
              </button>
            </div>
          </Panel>

          <Panel title="Bulk" accent="var(--pink)">
            <p className="text-sm font-medium text-[var(--ink-soft)]">
              Load a demo stream — {SAMPLE_FEED.length} comments across all four languages from a handful of repeat
              authors — or import a CSV with a <code className="font-bold">text</code> column (up to 500 rows). Every
              item is explained, so expect about a third of a second per comment on CPU.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                className={`${btn.sun} wiggle-hover`}
                disabled={!!busy}
                onClick={() => void runBatch(SAMPLE_FEED, "sample")}
              >
                ▶ Load demo stream
              </button>
              <label className={`${btn.secondary} cursor-pointer`}>
                ⇪ Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onCsv(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </Panel>

          {error && <ErrorBox>{error}</ErrorBox>}
        </div>

        <div>
          {busy && busy !== "one" ? (
            <section className="nb-card reveal space-y-4 bg-[var(--sky)] p-6" aria-busy="true">
              <p className="display text-2xl font-extrabold">Moderating…</p>
              <p className="text-sm font-bold">
                {progress[0]} / {progress[1]} classified, explained and routed
              </p>
              <div className="h-7 overflow-hidden rounded-lg border-[3px] border-[var(--ink)] bg-[var(--card)]">
                <div
                  className="h-full border-r-[3px] border-[var(--ink)] bg-[var(--sun)] transition-[width] duration-500"
                  style={{
                    width: `${progress[1] ? Math.max(4, (progress[0] / progress[1]) * 100) : 4}%`,
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, transparent 0 10px, rgba(17,17,17,.12) 10px 20px)",
                  }}
                />
              </div>
            </section>
          ) : item ? (
            <section className="nb-card reveal p-5 md:p-6">
              <ItemDetail item={item} />
              {item.status === "pending" && (
                <Link href="/console/queue" className={`${btn.primary} mt-5`}>
                  Open in review queue →
                </Link>
              )}
            </section>
          ) : batch ? (
            <section className="nb-card reveal space-y-5 p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="display text-3xl font-extrabold">{batch.items.length} items routed</h2>
                <span className="nb-sticker bg-[var(--mint-soft)]">done</span>
              </div>
              <div className="stagger grid grid-cols-3 gap-3 text-center">
                <Tile n={batch.summary.allow} label="Auto-allowed" bg="var(--mint-soft)" />
                <Tile n={batch.summary.review} label="Sent to review" bg="var(--amber-soft)" />
                <Tile n={batch.summary.remove} label="Auto-removed" bg="var(--coral-soft)" />
              </div>
              {batch.skipped > 0 && (
                <p className="text-xs font-bold text-[var(--ink-muted)]">{batch.skipped} empty rows skipped.</p>
              )}
              <div className="flex flex-wrap gap-2.5">
                <Link href="/console/queue" className={btn.primary}>
                  Review queue →
                </Link>
                <Link href="/console" className={btn.secondary}>
                  Dashboard
                </Link>
              </div>
            </section>
          ) : (
            <section className="nb-card relative flex min-h-[260px] flex-col justify-center overflow-hidden bg-[var(--mint-soft)] p-7">
              <span className="nb-sticker absolute right-5 top-5 bg-[var(--sun)]" aria-hidden>
                idle
              </span>
              <p className="display text-3xl font-extrabold">Nothing ingested yet.</p>
              <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed">
                The decision, the rule that fired and an auditable statement of reasons will land here.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Tile({ n, label, bg }: { n: number; label: string; bg: string }) {
  const v = useCountUp(n);
  return (
    <div className="rounded-xl border-[3px] border-[var(--ink)] p-3 shadow-[3px_3px_0_0_var(--ink)]" style={{ background: bg }}>
      <p className="display text-4xl font-extrabold tabular-nums">{Math.round(v)}</p>
      <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.08em]">{label}</p>
    </div>
  );
}
