"use client";

import { useEffect, useState } from "react";
import { useConsole } from "@/components/console/ConsoleShell";
import { ErrorBox, PageHeader, btn, field } from "@/components/console/ui";
import { ApiError } from "@/lib/api";
import { LANG_NAMES, mod, timeAgo, type Term } from "@/lib/console";

export default function ListsPage() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setTerms(await mod.lists());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load lists.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        title="Block & allow lists"
        kicker="Overrides"
        accent="var(--pink)"
        lead="Fix what the model gets wrong today, without retraining. Lists apply on top of the model and are checked before the policy thresholds. A term of 3+ characters matches any word that contains it, so one stem catches inflected forms (गध → गधा, गधे)."
      />
      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <ListColumn
          kind="block"
          title="Blocklist"
          blurb="Always actioned (removed or sent to review, per the active policy), whatever the model says. Use it for slurs and local abuse the model misses."
          terms={terms?.filter((t) => t.list === "block")}
          onChange={load}
          onError={setError}
        />
        <ListColumn
          kind="allow"
          title="Allowlist"
          blurb="Words that should not count as evidence of abuse — reclaimed terms, names, community jargon. If every word driving a high score is allowlisted, the item is allowed."
          terms={terms?.filter((t) => t.list === "allow")}
          onChange={load}
          onError={setError}
        />
      </div>
    </>
  );
}

function ListColumn({
  kind,
  title,
  blurb,
  terms,
  onChange,
  onError,
}: {
  kind: "block" | "allow";
  title: string;
  blurb: string;
  terms: Term[] | undefined;
  onChange: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const { moderator } = useConsole();
  const [term, setTerm] = useState("");
  const [language, setLanguage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await mod.addTerm({ list: kind, term: term.trim(), language: language || null, note, actor: moderator });
      setTerm("");
      setNote("");
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not add term.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    onError(null);
    try {
      await mod.deleteTerm(id, moderator);
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not remove term.");
    }
  }

  return (
    <section className="nb-card overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] px-4 py-3"
        style={{ background: kind === "block" ? "var(--coral)" : "var(--mint)" }}
      >
        <h2 className="display text-2xl font-extrabold text-white">
          {kind === "block" ? "⛔ " : "✅ "}
          {title}
        </h2>
        <span key={terms?.length} className="stamp nb-tag text-sm">
          {terms?.length ?? 0} term{terms?.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-4 p-4 md:p-5">
      <p className="text-sm font-medium text-[var(--ink-soft)]">{blurb}</p>
      <form onSubmit={add} className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" className={`${field} indic`} aria-label="Term" />
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={field} aria-label="Language">
          <option value="">All languages</option>
          {["hi", "kn", "mr", "bn"].map((l) => (
            <option key={l} value={l}>{LANG_NAMES[l]}</option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" className={field} aria-label="Note" />
        <button type="submit" className={btn.primary} disabled={busy || !term.trim()}>
          + Add
        </button>
      </form>
      {terms === undefined ? (
        <div className="skeleton h-20 w-full" />
      ) : terms.length === 0 ? (
        <p className="rounded-xl border-[3px] border-dashed border-[var(--ink)] p-4 text-center text-sm font-bold text-[var(--ink-muted)]">
          No terms yet.
        </p>
      ) : (
        <ul className="stagger space-y-2.5">
          {terms.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border-[3px] border-[var(--ink)] px-3 py-2.5 shadow-[3px_3px_0_0_var(--ink)]"
              style={{ background: kind === "block" ? "var(--coral-soft)" : "var(--mint-soft)" }}
            >
              <div className="min-w-0">
                <p className="indic text-lg font-bold">{t.term}</p>
                <p className="truncate text-xs font-medium text-[var(--ink-soft)]">
                  {t.language ? LANG_NAMES[t.language] : "All languages"} · added {timeAgo(t.created_at)}
                  {t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(t.id)}
                className="nb-btn nb-btn--sm shrink-0"
                aria-label={`Remove ${t.term}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
