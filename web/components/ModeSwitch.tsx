"use client";

import type { WorkspaceMode } from "@/lib/types";

type Props = {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
};

export function ModeSwitch({ mode, onChange }: Props) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-xl border-[3px] border-[var(--ink)] bg-[var(--card)] p-1.5 shadow-[4px_4px_0_0_var(--ink)]"
      role="tablist"
      aria-label="Workspace mode"
    >
      {(
        [
          { id: "analyze", label: "Analyze a comment" },
          { id: "bulk", label: "Bulk CSV" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={mode === item.id}
          data-active={mode === item.id || undefined}
          className="rounded-lg border-2 border-transparent px-4 py-2 text-sm font-bold transition-all duration-150 hover:bg-[var(--paper)] data-[active]:border-[var(--ink)] data-[active]:bg-[var(--ink)] data-[active]:text-[var(--sun)]"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
