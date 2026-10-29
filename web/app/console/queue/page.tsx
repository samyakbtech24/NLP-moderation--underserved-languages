"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConsole } from "@/components/console/ConsoleShell";
import { ItemDetail } from "@/components/console/ItemDetail";
import { EmptyState, ErrorBox, PageHeader, RiskMeter, btn, field } from "@/components/console/ui";
import { ApiError } from "@/lib/api";
import { LANG_NAMES, mod, timeAgo, type Item } from "@/lib/console";

type Order = "risk" | "oldest";

export default function QueuePage() {
  const { moderator, refresh } = useConsole();
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [order, setOrder] = useState<Order>("risk");
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const select = useCallback(async (it: Item | undefined) => {
    setCategory("");
    setNote("");
    if (!it) return setSelected(null);
    setSelected(it);
    try {
      setSelected(await mod.item(it.id)); // adds author strike count
    } catch {}
  }, []);

  const load = useCallback(
    async (keepId?: number) => {
      try {
        const r = await mod.items({ status: "pending", order, limit: 200 });
        setItems(r.items);
        const next = r.items.find((i) => i.id === keepId) ?? r.items[0];
        void select(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the queue.");
      }
    },
    [order, select],
  );

  useEffect(() => {
    void load();
    mod.categories().then(setCategories).catch(() => {});
  }, [load]);

  async function decide(decision: "approve" | "remove") {
    if (!selected || busy) return;
    if (decision === "remove" && !category) {
      setError("Pick a policy category before removing — it goes into the statement of reasons.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mod.decide(selected.id, { decision, moderator, category: category || undefined, note });
      setDone((n) => n + 1);
      const idx = items?.findIndex((i) => i.id === selected.id) ?? -1;
      const nextId = items?.[idx + 1]?.id;
      refresh();
      await load(nextId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "a") void decide("approve");
      if (e.key === "r") void decide("remove");
      if ((e.key === "j" || e.key === "k") && items?.length && selected) {
        const idx = items.findIndex((i) => i.id === selected.id);
        const next = items[Math.min(items.length - 1, Math.max(0, idx + (e.key === "j" ? 1 : -1)))];
        void select(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <PageHeader
        title="Review queue"
        kicker={items ? `${items.length} waiting` : "Queue"}
        accent="var(--amber-soft)"
        lead="Items the active policy couldn't decide on its own. Approve keeps the content up; Remove takes it down with a policy category that goes into the statement of reasons."
        actions={
          <div className="inline-flex gap-1 rounded-xl border-[3px] border-[var(--ink)] bg-[var(--card)] p-1 text-sm shadow-[3px_3px_0_0_var(--ink)]">
            {(["risk", "oldest"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                className={`rounded-lg px-3 py-1.5 font-bold transition-colors ${
                  order === o ? "bg-[var(--ink)] text-[var(--sun)]" : "hover:bg-[var(--paper)]"
                }`}
              >
                {o === "risk" ? "Highest risk first" : "Oldest first"}
              </button>
            ))}
          </div>
        }
      />

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      {items === null ? (
        <div className="skeleton h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title={done ? `Queue cleared — ${done} decided` : "Queue is empty"}>
          Nothing is waiting for review.{" "}
          <Link href="/console/ingest" className="underline underline-offset-2">
            Ingest some content
          </Link>{" "}
          or switch to a stricter policy to send more items here.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <ul className="stagger max-h-[72vh] space-y-3 overflow-y-auto p-1 pr-3" aria-label="Pending items">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => void select(it)}
                  aria-current={selected?.id === it.id}
                  className={`w-full rounded-xl border-[3px] border-[var(--ink)] px-4 py-3 text-left transition-all duration-150 ${
                    selected?.id === it.id
                      ? "translate-x-1 bg-[var(--sun)] shadow-[5px_5px_0_0_var(--ink)]"
                      : "bg-[var(--card)] shadow-[3px_3px_0_0_var(--ink)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--ink)]"
                  }`}
                >
                  <p className="indic truncate text-base font-bold">{it.text}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs font-bold text-[var(--ink-soft)]">
                    <RiskMeter value={it.p_abusive} />
                    <span>{LANG_NAMES[it.language]}</span>
                    <span>@{it.author}</span>
                    <span>{timeAgo(it.created_at)}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <section className="nb-card reveal space-y-6 p-5 md:p-6" key={selected.id}>
              <ItemDetail item={selected} />
              <div className="space-y-4 border-t-[3px] border-dashed border-[var(--ink)] pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="nb-label">
                    Policy category
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1.5 normal-case tracking-normal`}>
                      <option value="">Select…</option>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="nb-label">
                    Note (optional)
                    <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1.5 normal-case tracking-normal`} placeholder="Context for the log" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btn.good} disabled={busy} onClick={() => void decide("approve")}>
                    ✓ Approve · keep up
                  </button>
                  <button type="button" className={btn.danger} disabled={busy} onClick={() => void decide("remove")}>
                    ✕ Remove
                  </button>
                  <p className="ml-auto hidden text-xs font-medium text-[var(--ink-muted)] md:block">
                    Keys: <kbd>A</kbd> approve · <kbd>R</kbd> remove · <kbd>J</kbd>/<kbd>K</kbd> next/prev · deciding as{" "}
                    <span className="font-bold text-[var(--ink)]">{moderator}</span>
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
