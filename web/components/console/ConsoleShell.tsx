"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { mod, type Policy } from "@/lib/console";

type ConsoleCtx = {
  moderator: string;
  setModerator: (name: string) => void;
  queueCount: number | null;
  activePolicy: Policy | null;
  /** Re-fetch the queue badge and active policy (after a decision or policy change). */
  refresh: () => void;
};

const Ctx = createContext<ConsoleCtx | null>(null);

export function useConsole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole must be used inside ConsoleShell");
  return c;
}

const NAV = [
  { href: "/console", label: "Dashboard", icon: "◧", accent: "var(--sun)" },
  { href: "/console/ingest", label: "Ingest", icon: "⇥", accent: "var(--sky)" },
  { href: "/console/queue", label: "Review queue", icon: "◷", accent: "var(--amber-soft)", badge: true },
  { href: "/console/decisions", label: "Decision log", icon: "☰", accent: "var(--mint-soft)" },
  { href: "/console/policies", label: "Policies", icon: "⚖", accent: "var(--violet-soft)" },
  { href: "/console/lists", label: "Block & allow", icon: "⛒", accent: "var(--pink)" },
  { href: "/console/audit", label: "Audit log", icon: "⌘", accent: "var(--coral-soft)" },
];

const MOD_KEY = "fairmod.moderator";

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moderator, setModeratorState] = useState("moderator");
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [activePolicy, setActivePolicy] = useState<Policy | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MOD_KEY);
      if (saved) setModeratorState(saved);
    } catch {}
  }, []);

  const setModerator = useCallback((name: string) => {
    setModeratorState(name);
    try {
      window.localStorage.setItem(MOD_KEY, name);
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [q, policies] = await Promise.all([
        mod.items({ status: "pending", limit: 1 }),
        mod.policies(),
      ]);
      setQueueCount(q.total);
      setActivePolicy(policies.find((p) => p.is_active) ?? null);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ moderator, setModerator, queueCount, activePolicy, refresh: () => void refresh() }}
    >
      <div className="shell mx-auto flex min-h-dvh w-full max-w-[90rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:flex-row lg:gap-8 lg:px-8 lg:py-8">
        <aside className="flex shrink-0 flex-col gap-4 lg:sticky lg:top-8 lg:h-[calc(100dvh-4rem)] lg:w-60">
          <div className="nb-card flex items-center justify-between gap-3 bg-[var(--ink)] px-4 py-3 text-[var(--paper)] lg:block">
            <Link href="/console" className="flex items-center gap-2">
              <span className="display grid h-9 w-9 place-items-center rounded-lg border-[3px] border-[var(--paper)] bg-[var(--coral)] text-lg font-extrabold text-white">
                F
              </span>
              <span className="display text-2xl font-extrabold tracking-tight">FairMod</span>
            </Link>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.24em] text-[var(--sun)] lg:mt-2">
              Moderation console
            </p>
          </div>

          <nav
            aria-label="Console"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 pt-1 lg:mx-0 lg:flex-col lg:gap-2 lg:overflow-visible lg:p-0"
          >
            {NAV.map((n) => {
              const active = n.href === "/console" ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex shrink-0 items-center gap-2.5 rounded-xl border-[3px] px-3 py-2 text-sm font-bold transition-all duration-150 ${
                    active
                      ? "border-[var(--ink)] shadow-[4px_4px_0_0_var(--ink)] lg:translate-x-1"
                      : "border-transparent hover:-translate-y-0.5 hover:border-[var(--ink)] hover:bg-[var(--card)] hover:shadow-[3px_3px_0_0_var(--ink)]"
                  }`}
                  style={active ? { background: n.accent } : undefined}
                >
                  <span
                    className="grid h-7 w-7 place-items-center rounded-md border-2 border-[var(--ink)] bg-[var(--card)] text-sm transition-transform group-hover:-rotate-6"
                    aria-hidden
                  >
                    {n.icon}
                  </span>
                  {n.label}
                  {n.badge && queueCount ? (
                    <span
                      key={queueCount}
                      className="stamp ml-auto rounded-md border-2 border-[var(--ink)] bg-[var(--coral)] px-1.5 text-xs tabular-nums text-white"
                    >
                      {queueCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 rounded-xl border-[3px] border-dashed border-[var(--ink)] px-3 py-2 text-sm font-bold transition-colors hover:bg-[var(--card)] lg:mt-2"
            >
              ← Model playground
            </Link>
          </nav>

          <div className="nb-card hidden space-y-3 p-3.5 text-xs lg:mt-auto lg:block">
            <label className="block">
              <span className="nb-label">Signed in as</span>
              <input
                value={moderator}
                onChange={(e) => setModerator(e.target.value)}
                onBlur={(e) => !e.target.value.trim() && setModerator("moderator")}
                className="nb-input mt-1.5 !py-1.5 text-sm font-bold"
              />
            </label>
            <div>
              <p className="nb-label">Active policy</p>
              <Link
                href="/console/policies"
                className="mt-1 inline-block rounded-md border-2 border-[var(--ink)] bg-[var(--violet-soft)] px-2 py-0.5 text-sm font-bold hover:bg-[var(--violet)] hover:text-white"
              >
                {activePolicy?.name ?? "—"}
              </Link>
            </div>
            <p className="flex items-center gap-2 font-bold">
              {online ? (
                <span className="live-dot" aria-hidden />
              ) : (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--ink)]"
                  style={{ background: online === false ? "var(--coral)" : "var(--paper-deep)" }}
                  aria-hidden
                />
              )}
              {online === null ? "Connecting…" : online ? "API online" : "API offline"}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-12">
          {online === false && (
            <div
              className="nb-card reveal mb-6 flex flex-wrap items-center gap-3 !bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium"
              role="status"
            >
              <span className="nb-tag !bg-[var(--coral)] !text-white">OFFLINE</span>
              Backend isn&apos;t answering. Run <code className="font-bold">python app.py</code> in the repo root — this
              page reconnects on its own.
            </div>
          )}
          <div key={pathname}>{children}</div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
