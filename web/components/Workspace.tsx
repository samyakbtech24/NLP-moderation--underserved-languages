"use client";

import { useCallback, useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";
import type { WorkspaceMode } from "@/lib/types";
import { AnalyzePanel } from "./AnalyzePanel";
import { BrandHero } from "./BrandHero";
import { BulkPanel } from "./BulkPanel";

export function Workspace() {
  const [mode, setMode] = useState<WorkspaceMode>("analyze");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [seedText, setSeedText] = useState<string | undefined>();
  const [seedNonce, setSeedNonce] = useState(0);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await checkHealth();
      setApiOnline(h.status === "ok");
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 20000);
    return () => window.clearInterval(id);
  }, [refreshHealth]);

  function explainFromBulk(text: string) {
    setSeedText(text);
    setSeedNonce((n) => n + 1);
    setMode("analyze");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="shell flex min-h-dvh flex-col">
      <BrandHero mode={mode} onModeChange={setMode} apiOnline={apiOnline} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 md:py-12 lg:px-8">
        {apiOnline === false && (
          <div className="nb-card reveal flex flex-wrap items-center gap-3 !bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium" role="status">
            <span className="nb-tag !bg-[var(--coral)] !text-[var(--card)]">OFFLINE</span>
            Backend isn&apos;t answering. Run <code className="font-bold">python app.py</code> in the repo root.
            <button type="button" className="nb-btn nb-btn--sm ml-auto" onClick={() => void refreshHealth()}>
              Check again
            </button>
          </div>
        )}

        <div key={mode} className="reveal">
          {mode === "analyze" ? (
            <AnalyzePanel seedText={seedText} seedNonce={seedNonce} />
          ) : (
            <BulkPanel onExplain={explainFromBulk} />
          )}
        </div>
      </div>

      <footer className="border-t-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-5 text-xs font-medium text-[var(--paper)] sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>FairMod · MuRIL + Integrated Gradients · macro-F1 0.876 · seed 42</span>
          <span className="text-[var(--sun)]">Research prototype — keep a human in the loop.</span>
        </div>
      </footer>
    </div>
  );
}
