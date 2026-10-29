"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorBox, PageHeader } from "@/components/console/ui";
import { mod, type AuditEvent } from "@/lib/console";

const EVENT_LABEL: Record<string, string> = {
  "item.decision": "Decided item",
  "policy.created": "Created policy",
  "policy.updated": "Updated policy",
  "policy.activated": "Activated policy",
  "blocklist.added": "Added to blocklist",
  "blocklist.removed": "Removed from blocklist",
  "allowlist.added": "Added to allowlist",
  "allowlist.removed": "Removed from allowlist",
};

function describe(e: AuditEvent): string {
  const d = e.detail as Record<string, unknown>;
  if (e.event === "item.decision") {
    return `${d.decision === "approve" ? "approved" : "removed"} (was ${d.previous_status})${d.category ? ` · ${d.category}` : ""}`;
  }
  if (e.event === "policy.updated") {
    const pair = (k: string) => {
      const v = d[k] as [number | string, number | string] | undefined;
      return v && v[0] !== v[1] ? `${k} ${fmt(v[0])} → ${fmt(v[1])}` : null;
    };
    return ["review", "remove", "blocklist_action"].map(pair).filter(Boolean).join(" · ") || "no threshold change";
  }
  if (d.language) return `language: ${d.language}`;
  return "";
}

function eventTone(event: string): string {
  if (event.startsWith("item")) return "var(--sun)";
  if (event.startsWith("policy")) return "var(--sky)";
  if (event.startsWith("blocklist")) return "var(--coral-soft)";
  return "var(--mint-soft)";
}

const fmt = (v: number | string) => (typeof v === "number" ? `${Math.round(v * 100)}%` : v);

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mod.audit(500).then(setEvents).catch((e) => setError(e instanceof Error ? e.message : "Could not load audit log."));
  }, []);

  return (
    <>
      <PageHeader
        title="Audit log"
        kicker="Append-only"
        accent="var(--coral-soft)"
        lead="Who changed what, and when: every human decision and every change to policies and lists. Append-only."
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      {events === null ? (
        !error && <div className="skeleton h-64 w-full" />
      ) : events.length === 0 ? (
        <EmptyState title="Nothing recorded yet">Decisions and configuration changes show up here.</EmptyState>
      ) : (
        <div className="nb-card reveal overflow-x-auto">
          <table className="nb-table w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">Time (local)</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-[var(--sun)]/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-bold tabular-nums text-[var(--ink-muted)]">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="nb-tag bg-[var(--violet-soft)]">☺ {e.actor}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="nb-tag" style={{ background: eventTone(e.event) }}>
                      {EVENT_LABEL[e.event] ?? e.event}
                    </span>
                  </td>
                  <td className="indic px-4 py-3 font-bold">{e.target}</td>
                  <td className="px-4 py-3 font-medium text-[var(--ink-soft)]">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
