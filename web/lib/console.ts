import { ApiError } from "./api";
import type { WordScore } from "./types";

export type Action = "allow" | "review" | "remove";
export type Status = "allowed" | "pending" | "removed" | "approved";
export type Lang = "hi" | "kn" | "mr" | "bn" | "other";

export type Item = {
  id: number;
  text: string;
  language: Lang;
  author: string;
  source: string;
  p_abusive: number;
  word_scores: WordScore[];
  latency_ms: number;
  policy_name: string;
  auto_action: Action;
  rule: string;
  auto_reason: string;
  status: Status;
  decided_by: string;
  category: string | null;
  moderator_note: string | null;
  final_reason: string;
  created_at: string;
  decided_at: string | null;
  author_strikes?: number;
};

export type Policy = {
  id: number;
  name: string;
  description: string;
  review_threshold: number;
  remove_threshold: number;
  blocklist_action: "remove" | "review";
  is_active: number;
  updated_at: string;
};

export type Term = {
  id: number;
  list: "block" | "allow";
  term: string;
  language: Lang | null;
  note: string;
  created_at: string;
};

export type AuditEvent = {
  id: number;
  ts: string;
  actor: string;
  event: string;
  target: string;
  detail: Record<string, unknown>;
};

export type Analytics = {
  total: number;
  status: Record<Status, number>;
  auto_actions: Record<Action, number>;
  rules: Record<string, number>;
  by_language: Record<string, { total: number } & Record<Action, number>>;
  human_reviewed: number;
  agreement: number | null;
  median_decision_seconds: number | null;
  top_words: { word: string; language: Lang; count: number }[];
  daily: ({ date: string } & Record<Action, number>)[];
  active_policy: Policy | null;
};

export type BatchResult = {
  items: Item[];
  skipped: number;
  summary: Record<Action, number>;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/mod/${path}`, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") msg = data.detail;
      else if (Array.isArray(data?.detail)) msg = data.detail.map((d: { msg: string }) => d.msg).join("; ");
      else if (typeof data?.error === "string") msg = data.error;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const mod = {
  moderate: (text: string, author: string, source: string) =>
    call<Item>("moderate", post({ text, author, source })),
  batch: (items: { text: string; author?: string; source?: string }[]) =>
    call<BatchResult>("moderate/batch", post({ items })),
  items: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return call<{ total: number; items: Item[] }>(`items?${qs}`);
  },
  item: (id: number) => call<Item>(`items/${id}`),
  decide: (id: number, body: { decision: "approve" | "remove"; moderator: string; category?: string; note?: string }) =>
    call<Item>(`items/${id}/decision`, post(body)),
  categories: () => call<string[]>("categories"),
  policies: () => call<Policy[]>("policies"),
  createPolicy: (body: Omit<Policy, "id" | "is_active" | "updated_at"> & { actor: string }) =>
    call<Policy>("policies", post(body)),
  updatePolicy: (id: number, body: Omit<Policy, "id" | "is_active" | "updated_at"> & { actor: string }) =>
    call<Policy>(`policies/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  activatePolicy: (id: number, actor: string) =>
    call<Policy>(`policies/${id}/activate?actor=${encodeURIComponent(actor)}`, { method: "POST" }),
  lists: () => call<Term[]>("lists"),
  addTerm: (body: { list: "block" | "allow"; term: string; language?: string | null; note?: string; actor: string }) =>
    call<Term>("lists", post(body)),
  deleteTerm: (id: number, actor: string) =>
    call<{ deleted: number }>(`lists/${id}?actor=${encodeURIComponent(actor)}`, { method: "DELETE" }),
  analytics: () => call<Analytics>("analytics"),
  audit: (limit = 100) => call<AuditEvent[]>(`audit?limit=${limit}`),
  exportUrl: "/api/mod/export.csv",
};

export const LANG_NAMES: Record<string, string> = {
  hi: "Hindi",
  kn: "Kannada",
  mr: "Marathi",
  bn: "Bengali",
  other: "Other / mixed",
};

export const STATUS_LABEL: Record<Status, string> = {
  allowed: "Allowed",
  pending: "In review",
  removed: "Removed",
  approved: "Approved",
};

export const RULE_LABEL: Record<string, string> = {
  below_threshold: "Below review threshold",
  review_band: "Review band",
  auto_remove: "Auto-remove threshold",
  blocklist: "Blocklist hit",
  allowlist: "Allowlist",
};

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
