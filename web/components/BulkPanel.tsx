"use client";

import { useCallback, useMemo, useState } from "react";
import { ApiError, MAX_CSV_ROWS, bulkRank } from "@/lib/api";
import { resultsToCsv, textsFromCsv } from "@/lib/csv";
import type { BulkResult } from "@/lib/types";

type SortKey = "p_abusive" | "text" | "flagged";
type SortDir = "asc" | "desc";

type Props = {
  onExplain: (text: string) => void;
};

export function BulkPanel({ onExplain }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [column, setColumn] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [flagged, setFlagged] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("p_abusive");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (!results) return [];
    const copy = [...results];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "text") cmp = a.text.localeCompare(b.text);
      else if (sortKey === "flagged") cmp = Number(a.flagged) - Number(b.flagged);
      else cmp = a.p_abusive - b.p_abusive;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setResults(null);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file.");
      return;
    }
    setLoading(true);
    try {
      const raw = await file.text();
      const { texts, column: col } = textsFromCsv(raw);
      setColumn(col);
      const data = await bulkRank(texts);
      setResults(data.results);
      setFlagged(data.flagged);
      setTotal(data.total);
      setSortKey("p_abusive");
      setSortDir("desc");
    } catch (e) {
      setResults(null);
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "text" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    if (!results?.length) return;
    const blob = new Blob([resultsToCsv(results)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fairmod-ranked.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div
        className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-[3px] border-dashed border-[var(--ink)] p-10 text-center transition-all duration-150 ${
          dragOver ? "-translate-x-1 -translate-y-1 bg-[var(--sun)] shadow-[8px_8px_0_0_var(--ink)]" : "bg-[var(--card)] shadow-[5px_5px_0_0_var(--ink)]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void processFile(file);
        }}
      >
        <span className="nb-sticker bg-[var(--pink)]">CSV</span>
        <p className="display text-3xl font-extrabold">{dragOver ? "Let go!" : "Drop a CSV here"}</p>
        <p className="max-w-md text-sm font-medium text-[var(--ink-muted)]">
          Uses a <code className="font-bold text-[var(--ink)]">text</code> column if there is one, otherwise the first
          column. Up to {MAX_CSV_ROWS.toLocaleString()} rows, ranked by abusive probability (fast path, no
          explanations).
        </p>
        <label className="nb-btn nb-btn--ink mt-1 cursor-pointer">
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void processFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {fileName && <p className="nb-tag">📄 {fileName}</p>}
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          <p className="text-sm font-bold">Ranking comments…</p>
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      )}

      {error && (
        <div className="nb-card reveal !bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium" role="alert">
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="nb-card reveal overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--violet-soft)] px-4 py-3 md:px-5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="nb-tag !bg-[var(--coral)] !text-[var(--card)]">{flagged} flagged</span>
              of {total}
              {column ? <span className="font-medium text-[var(--ink-muted)]">· column “{column}”</span> : null}
            </p>
            <button type="button" onClick={exportCsv} className="nb-btn nb-btn--sm nb-btn--sun">
              ↓ Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="nb-table w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <SortHeader label="Flag" active={sortKey === "flagged"} dir={sortDir} onClick={() => toggleSort("flagged")} />
                  <SortHeader label="P(abusive)" active={sortKey === "p_abusive"} dir={sortDir} onClick={() => toggleSort("p_abusive")} />
                  <SortHeader label="Text" active={sortKey === "text"} dir={sortDir} onClick={() => toggleSort("text")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={`${i}-${row.p_abusive}`}
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-[var(--sun)]/40 focus-visible:bg-[var(--sun)]/40 focus-visible:outline-none"
                    onClick={() => onExplain(row.text)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onExplain(row.text);
                      }
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 md:px-5">
                      <span
                        className="nb-tag"
                        style={{ background: row.flagged ? "var(--coral-soft)" : "var(--mint-soft)" }}
                      >
                        {row.flagged ? "● Flagged" : "○ Clear"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums md:px-5">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-14 overflow-hidden rounded border-2 border-[var(--ink)] bg-[var(--paper)]" aria-hidden>
                          <span
                            className="block h-full"
                            style={{ width: `${row.p_abusive * 100}%`, background: row.flagged ? "var(--coral)" : "var(--mint)" }}
                          />
                        </span>
                        {(row.p_abusive * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="indic max-w-[28rem] truncate px-4 py-3 md:px-5">{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-2.5 text-xs font-bold md:px-5">
            Click any row to open it in Analyze with a full word-level explanation →
          </p>
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <th className="px-4 py-3 md:px-5">
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 uppercase">
        {label}
        <span aria-hidden className={active ? "" : "opacity-30"}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
  );
}
