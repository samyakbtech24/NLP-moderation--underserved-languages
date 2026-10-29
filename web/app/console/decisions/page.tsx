"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useConsole } from "@/components/console/ConsoleShell";
import { ItemDetail } from "@/components/console/ItemDetail";
import { Badge, EmptyState, ErrorBox, PageHeader, RiskMeter, StatusBadge, btn, field } from "@/components/console/ui";
import { ApiError } from "@/lib/api";
import { LANG_NAMES, mod, timeAgo, type Item } from "@/lib/console";

const PAGE = 25;

export default function DecisionsPage() {
  const { moderator, refresh } = useConsole();
  const [status, setStatus] = useState("");
  const [language, setLanguage] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; items: Item[] } | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await mod.items({ status, language, decided_by: decidedBy, q: query, limit: PAGE, offset: page * PAGE }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load decisions.");
    }
  }, [status, language, decidedBy, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(it: Item) {
    if (open?.id === it.id) return setOpen(null);
    setOpen(it);
    try {
      setOpen(await mod.item(it.id));
    } catch {}
  }

  async function override(it: Item, decision: "approve" | "remove") {
    setError(null);
    try {
      const updated = await mod.decide(it.id, {
        decision,
        moderator,
        category: decision === "approve" ? "Not abusive (false positive)" : "Other",
        note: "Changed from the decision log.",
      });
      setOpen(updated);
      refresh();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Override failed.");
    }
  }

  const filter = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Decision log"
        kicker={data ? `${data.total} records` : "Records"}
        accent="var(--mint-soft)"
        lead="Every item and every decision, automated or human, with the rule that fired and the statement of reasons — the record you keep for audits, appeals and transparency reports."
        actions={
          <a href={mod.exportUrl} className={btn.sun} download>
            ↓ Export CSV
          </a>
        }
      />

      <form
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,10rem))_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
          setPage(0);
        }}
      >
        <select aria-label="Status" value={status} onChange={filter(setStatus)} className={field}>
          <option value="">All statuses</option>
          <option value="allowed">Allowed</option>
          <option value="pending">In review</option>
          <option value="removed">Removed</option>
          <option value="approved">Approved</option>
        </select>
        <select aria-label="Language" value={language} onChange={filter(setLanguage)} className={field}>
          <option value="">All languages</option>
          {Object.entries(LANG_NAMES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select aria-label="Decided by" value={decidedBy} onChange={filter(setDecidedBy)} className={field}>
          <option value="">System + human</option>
          <option value="system">System only</option>
          <option value="human">Human only</option>
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search text or author, press Enter"
          className={field}
        />
      </form>

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      {data === null ? (
        <div className="skeleton h-64 w-full" />
      ) : data.items.length === 0 ? (
        <EmptyState title="No matching items">Try clearing the filters, or ingest some content first.</EmptyState>
      ) : (
        <div className="nb-card reveal overflow-hidden">
          <div className="overflow-x-auto">
            <table className="nb-table w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Text</th>
                  <th className="px-4 py-3 font-medium">P(abusive)</th>
                  <th className="px-4 py-3 font-medium">Lang</th>
                  <th className="px-4 py-3 font-medium">Decided by</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <Fragment key={it.id}>
                    <tr
                      tabIndex={0}
                      onClick={() => void toggle(it)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), void toggle(it))}
                      className={`cursor-pointer transition-colors hover:bg-[var(--sun)]/35 focus-visible:bg-[var(--sun)]/35 focus-visible:outline-none ${
                        open?.id === it.id ? "bg-[var(--sun)]/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-bold tabular-nums text-[var(--ink-muted)]">{it.id}</td>
                      <td className="px-4 py-3"><StatusBadge status={it.status} /></td>
                      <td className="indic max-w-[22rem] truncate px-4 py-3 font-medium">{it.text}</td>
                      <td className="whitespace-nowrap px-4 py-3"><RiskMeter value={it.p_abusive} /></td>
                      <td className="px-4 py-3 font-bold uppercase">{it.language}</td>
                      <td className="px-4 py-3">
                        {it.decided_by === "system" ? <Badge tone="muted">⚙ system</Badge> : <Badge tone="violet">☺ {it.decided_by}</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-[var(--ink-muted)]">{timeAgo(it.decided_at ?? it.created_at)}</td>
                    </tr>
                    {open?.id === it.id && (
                      <tr className="bg-[var(--paper)]">
                        <td colSpan={7} className="px-4 py-5 md:px-6">
                          <ItemDetail item={open} />
                          <div className="mt-4 flex flex-wrap gap-2">
                            {open.status !== "approved" && open.status !== "allowed" && (
                              <button type="button" className={btn.secondary} onClick={() => void override(open, "approve")}>
                                Reinstate (approve)
                              </button>
                            )}
                            {open.status !== "removed" && (
                              <button type="button" className={btn.secondary} onClick={() => void override(open, "remove")}>
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3 text-xs font-bold">
            <span>
              {page * PAGE + 1}–{Math.min(data.total, (page + 1) * PAGE)} of {data.total}
            </span>
            <span className="flex gap-2">
              <button type="button" className={btn.secondary} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className={btn.secondary}
                disabled={(page + 1) * PAGE >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
