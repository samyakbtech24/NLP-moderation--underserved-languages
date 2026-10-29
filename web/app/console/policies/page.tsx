"use client";

import { useEffect, useMemo, useState } from "react";
import { useConsole } from "@/components/console/ConsoleShell";
import { ErrorBox, PageHeader, btn, field } from "@/components/console/ui";
import { ApiError } from "@/lib/api";
import { mod, type Policy } from "@/lib/console";

type Draft = Pick<Policy, "name" | "description" | "review_threshold" | "remove_threshold" | "blocklist_action">;

const NEW_DRAFT: Draft = {
  name: "New policy",
  description: "",
  review_threshold: 0.5,
  remove_threshold: 0.9,
  blocklist_action: "remove",
};

export default function PoliciesPage() {
  const { moderator, refresh } = useConsole();
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [scores, setScores] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const ps = await mod.policies();
      setPolicies(ps);
      return ps;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load policies.");
      return [];
    }
  }

  useEffect(() => {
    void load().then((ps) => {
      const active = ps.find((p) => p.is_active) ?? ps[0];
      if (active) edit(active);
    });
    mod.items({ limit: 1000 }).then((r) => setScores(r.items.map((i) => i.p_abusive))).catch(() => {});
  }, []);

  function edit(p: Policy | "new") {
    setError(null);
    if (p === "new") {
      setEditing("new");
      setDraft(NEW_DRAFT);
    } else {
      setEditing(p.id);
      setDraft({
        name: p.name,
        description: p.description,
        review_threshold: p.review_threshold,
        remove_threshold: p.remove_threshold,
        blocklist_action: p.blocklist_action,
      });
    }
  }

  // What the draft thresholds would have done to everything seen so far.
  const impact = useMemo(() => {
    const out = { allow: 0, review: 0, remove: 0 };
    for (const s of scores) {
      if (s >= draft.remove_threshold) out.remove++;
      else if (s >= draft.review_threshold) out.review++;
      else out.allow++;
    }
    return out;
  }, [scores, draft.review_threshold, draft.remove_threshold]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { ...draft, actor: moderator };
      const saved = editing === "new" ? await mod.createPolicy(body) : await mod.updatePolicy(editing as number, body);
      await load();
      setEditing(saved.id);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function activate(id: number) {
    try {
      await mod.activatePolicy(id, moderator);
      await load();
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not activate.");
    }
  }

  const setT = (key: "review_threshold" | "remove_threshold") => (v: number) =>
    setDraft((d) => {
      const next = { ...d, [key]: v };
      if (key === "review_threshold" && v > d.remove_threshold) next.remove_threshold = v;
      if (key === "remove_threshold" && v < d.review_threshold) next.review_threshold = v;
      return next;
    });

  const current = policies?.find((p) => p.id === editing);

  return (
    <>
      <PageHeader
        title="Policies"
        kicker="Rules engine"
        accent="var(--violet-soft)"
        lead="A policy turns the model's probability into an action. Different communities need different tolerances — a kids' platform and a political debate forum should not share thresholds. Exactly one policy is active; every decision records which one applied."
        actions={
          <button type="button" className={btn.sun} onClick={() => edit("new")}>
            + New policy
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <ul className="stagger space-y-4">
          {policies?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => edit(p)}
                className={`nb-card w-full p-4 text-left transition-all duration-150 ${
                  editing === p.id
                    ? "translate-x-1 bg-[var(--violet-soft)] shadow-[7px_7px_0_0_var(--ink)]"
                    : "hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_var(--ink)]"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold">{p.name}</span>
                  {p.is_active ? <span className="nb-sticker bg-[var(--red)] text-white">Active</span> : null}
                </span>
                {p.description && <span className="mt-1 block text-sm font-medium text-[var(--ink-soft)]">{p.description}</span>}
                <span className="mt-3 block">
                  <Bands review={p.review_threshold} remove={p.remove_threshold} compact />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {editing !== null && (
          <section className="nb-card reveal space-y-6 p-5 md:p-6" key={String(editing)}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="display text-3xl font-extrabold">{editing === "new" ? "New policy" : "Edit policy"}</h2>
              {current && !current.is_active && (
                <button type="button" className={`${btn.good} wiggle-hover`} onClick={() => void activate(current.id)}>
                  ⚡ Make active
                </button>
              )}
            </div>

            <div className="grid gap-3">
              <label className="nb-label">
                Name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1.5 normal-case tracking-normal`} />
              </label>
              <label className="nb-label">
                Description
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={`${field} mt-1.5 normal-case tracking-normal`}
                  placeholder="Who this policy is for"
                />
              </label>
            </div>

            <Bands review={draft.review_threshold} remove={draft.remove_threshold} />

            <div className="grid gap-5 sm:grid-cols-2">
              <Slider
                label="Send to review at"
                hint="Below this, content is allowed automatically."
                value={draft.review_threshold}
                onChange={setT("review_threshold")}
              />
              <Slider
                label="Remove automatically at"
                hint="At or above this, no human is needed."
                value={draft.remove_threshold}
                onChange={setT("remove_threshold")}
              />
            </div>

            <label className="nb-label">
              When a blocklisted term appears
              <select
                value={draft.blocklist_action}
                onChange={(e) => setDraft({ ...draft, blocklist_action: e.target.value as Draft["blocklist_action"] })}
                className={`${field} mt-1.5 normal-case tracking-normal`}
              >
                <option value="remove">Remove immediately</option>
                <option value="review">Send to human review</option>
              </select>
            </label>

            <div className="rounded-xl border-[3px] border-dashed border-[var(--ink)] bg-[var(--paper)] p-4">
              <p className="mb-3 text-[0.7rem] font-extrabold uppercase tracking-[0.14em]">
                ⚡ Live impact preview · {scores.length} items seen so far
              </p>
              {scores.length === 0 ? (
                <p className="text-sm font-medium text-[var(--ink-muted)]">Ingest some content to preview how these thresholds would route it.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {(
                    [
                      ["allow", "would be allowed", "var(--mint-soft)"],
                      ["review", "would need review", "var(--amber-soft)"],
                      ["remove", "would be removed", "var(--coral-soft)"],
                    ] as const
                  ).map(([k, label, bg]) => (
                    <div key={k} className="rounded-xl border-[3px] border-[var(--ink)] p-2.5 shadow-[3px_3px_0_0_var(--ink)]" style={{ background: bg }}>
                      <p key={impact[k]} className="pop-num display text-4xl font-extrabold tabular-nums">
                        {impact[k]}
                      </p>
                      <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.06em]">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs font-medium text-[var(--ink-muted)]">Model scores only — block and allow lists can still change individual outcomes.</p>
            </div>

            <button type="button" className={btn.primary} disabled={saving || !draft.name.trim()} onClick={() => void save()}>
              {saving ? "Saving…" : editing === "new" ? "Create policy" : "Save changes"}
            </button>
          </section>
        )}
      </div>
    </>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm">
        <span className="font-extrabold">{label}</span>
        <span className="display rounded-lg border-2 border-[var(--ink)] bg-[var(--sun)] px-2 text-xl font-extrabold tabular-nums shadow-[2px_2px_0_0_var(--ink)]">
          {Math.round(value * 100)}%
        </span>
      </span>
      <input
        type="range"
        min={1}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="nb-range mt-3"
      />
      <span className="mt-1.5 block text-xs font-medium text-[var(--ink-muted)]">{hint}</span>
    </label>
  );
}

/** The 0–100% probability axis split into allow / review / remove zones. */
function Bands({ review, remove, compact }: { review: number; remove: number; compact?: boolean }) {
  const zones = [
    { w: review, label: "Allow", bg: "var(--mint)" },
    { w: remove - review, label: "Review", bg: "var(--amber)" },
    { w: 1 - remove, label: "Remove", bg: "var(--coral)" },
  ];
  return (
    <div>
      <div
        className={`flex gap-[3px] overflow-hidden border-[var(--ink)] bg-[var(--ink)] ${
          compact ? "h-3.5 rounded-md border-2" : "h-11 rounded-xl border-[3px]"
        }`}
      >
        {zones.map((z) =>
          z.w > 0 ? (
            <div
              key={z.label}
              className="flex items-center justify-center overflow-hidden text-xs font-extrabold uppercase tracking-[0.06em] transition-[width] duration-200"
              style={{ width: `${z.w * 100}%`, background: z.bg }}
            >
              {!compact && z.w > 0.14 ? z.label : null}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] font-bold tabular-nums text-[var(--ink-muted)]">
        <span>0%</span>
        {!compact && <span>P(abusive)</span>}
        <span>100%</span>
      </div>
    </div>
  );
}
