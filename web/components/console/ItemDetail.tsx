"use client";

import { useState } from "react";
import { HighlightedText } from "@/components/HighlightedText";
import { LANG_NAMES, RULE_LABEL, timeAgo, type Item } from "@/lib/console";
import type { HighlightFilter } from "@/lib/types";
import { ActionBadge, Badge, RiskMeter, StatusBadge } from "./ui";

/** Comment + word highlights + statement of reasons. Used by the queue, log and ingest pages. */
export function ItemDetail({ item }: { item: Item }) {
  const [filter, setFilter] = useState<HighlightFilter>("all");
  const human = item.decided_by !== "system";
  const strikes = item.author_strikes ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.status} />
        <ActionBadge action={item.auto_action} />
        <Badge tone="violet">{LANG_NAMES[item.language] ?? item.language}</Badge>
        {strikes > 0 && (
          <Badge tone={strikes >= 3 ? "bad" : "warn"}>
            ⚑ {strikes} prior removal{strikes === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      <p className="text-xs font-bold text-[var(--ink-muted)]">
        #{item.id} · @{item.author} · {item.source} · {timeAgo(item.created_at)}
      </p>

      <dl className="grid grid-cols-3 gap-2.5 text-sm">
        <Stat label="P(abusive)">
          <RiskMeter value={item.p_abusive} />
        </Stat>
        <Stat label="Rule">{RULE_LABEL[item.rule] ?? item.rule}</Stat>
        <Stat label="Policy">{item.policy_name}</Stat>
      </dl>

      <HighlightedText words={item.word_scores} filter={filter} onFilterChange={setFilter} />

      <div className="relative rounded-xl border-[3px] border-[var(--ink)] bg-[var(--sun)] p-4 shadow-[4px_4px_0_0_var(--ink)]">
        <p className="mb-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.14em]">§ Statement of reasons</p>
        <p className="indic text-sm font-medium leading-relaxed">
          {human ? item.final_reason.split(" Original automated assessment:")[0] : item.auto_reason}
        </p>
        {human && (
          <p className="indic mt-2 border-t-2 border-dashed border-[var(--ink)] pt-2 text-xs leading-relaxed">
            Automated assessment: {item.auto_reason}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border-2 border-[var(--ink)] bg-[var(--paper)] px-2.5 py-2">
      <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.1em] text-[var(--ink-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate font-bold">{children}</dd>
    </div>
  );
}
