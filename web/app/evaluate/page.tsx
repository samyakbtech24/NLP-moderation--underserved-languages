"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBox, PageHeader } from "@/components/console/ui";
import { ResultsTable } from "@/components/eval/ResultsTable";
import { Scoreboard } from "@/components/eval/Scoreboard";
import { ApiError } from "@/lib/api";
import { LANG_NAMES, timeAgo } from "@/lib/console";
import {
  CURATED,
  computeMetrics,
  evalApi,
  exportCsv,
  exportJson,
  itemsFromCsv,
  itemsFromPaste,
  type Dataset,
  type EvalItem,
  type EvalResult,
  type SavedRun,
} from "@/lib/eval";

type Source = "testset" | "curated" | "csv" | "paste";

const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "testset", label: "Held-out test set", hint: "Balanced sample of the frozen test split — data the model never trained on." },
  { id: "curated", label: "Curated 32", hint: "Hand-written everyday insults and harmless sentences, 4 + 4 per language." },
  { id: "csv", label: "Upload CSV", hint: "Columns: text, label (abusive / normal or 1 / 0), optional language." },
  { id: "paste", label: "Paste", hint: "One per line: “abusive | text” or “normal | text” (or 1 / 0 with a comma or tab)." },
];

const ALL_LANGS = ["hi", "kn", "mr", "bn"];

export default function EvaluatePage() {
  const [source, setSource] = useState<Source>("testset");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [perCell, setPerCell] = useState(10);
  const [langs, setLangs] = useState<string[]>(ALL_LANGS);
  const [seed, setSeed] = useState(42);
  const [paste, setPaste] = useState("");
  const [items, setItems] = useState<EvalItem[] | null>(null);
  const [itemsLabel, setItemsLabel] = useState("");
  const [explain, setExplain] = useState(true);
  const [name, setName] = useState("");

  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, started: 0 });
  const [current, setCurrent] = useState<EvalItem[]>([]);
  const [runSource, setRunSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [loadedRun, setLoadedRun] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const metrics = useMemo(() => (results.length ? computeMetrics(results) : null), [results]);

  const loadRuns = useCallback(() => evalApi.runs().then(setRuns).catch(() => {}), []);
  useEffect(() => {
    evalApi.datasets().then(setDataset).catch(() => {});
    void loadRuns();
  }, [loadRuns]);

  const fail = (e: unknown) => setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

  async function prepare(): Promise<{ list: EvalItem[]; label: string } | null> {
    setError(null);
    if (source === "curated") return { list: CURATED, label: "Curated 32" };
    if (source === "paste") {
      const list = itemsFromPaste(paste);
      if (!list.length) throw new Error("Paste at least one line.");
      return { list, label: `Pasted ${list.length}` };
    }
    if (source === "testset") {
      if (!langs.length) throw new Error("Pick at least one language.");
      const r = await evalApi.sample(perCell, langs, seed);
      return { list: r.items, label: `Test set · ${perCell}/cell · ${langs.join(",")} · seed ${seed}` };
    }
    return items ? { list: items, label: itemsLabel } : null;
  }

  async function run() {
    let prepared;
    try {
      prepared = await prepare();
    } catch (e) {
      return fail(e);
    }
    if (!prepared?.list.length) return setError("Load some test data first.");
    const list = prepared.list;
    setItems(list);
    setItemsLabel(prepared.label);
    setRunSource(prepared.label);
    setResults([]);
    setLoadedRun(null);
    setNotice(null);
    setRunning(true);
    setProgress({ done: 0, total: list.length, started: performance.now() });
    const ctrl = new AbortController();
    abort.current = ctrl;
    const chunk = explain ? 4 : 48;
    try {
      for (let i = 0; i < list.length; i += chunk) {
        if (ctrl.signal.aborted) break;
        const slice = list.slice(i, i + chunk);
        setCurrent(slice);
        const r = await evalApi.predict(slice, explain, ctrl.signal);
        setResults((prev) => [...prev, ...r.results]);
        setProgress((p) => ({ ...p, done: Math.min(list.length, i + chunk) }));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) fail(e);
    } finally {
      setRunning(false);
      setCurrent([]);
      abort.current = null;
    }
  }

  async function save() {
    if (!results.length) return;
    try {
      const label = name.trim() || `${runSource} · ${new Date().toLocaleString()}`;
      const r = await evalApi.saveRun(label, runSource || "custom", results);
      setNotice(`Saved as run #${r.id}.`);
      void loadRuns();
    } catch (e) {
      fail(e);
    }
  }

  async function openRun(id: number) {
    try {
      const r = await evalApi.run(id);
      setResults(r.results);
      setRunSource(r.source);
      setLoadedRun(`#${r.id} · ${r.name}`);
      setNotice(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      fail(e);
    }
  }

  async function onCsv(file: File) {
    try {
      const list = itemsFromCsv(await file.text());
      setItems(list);
      setItemsLabel(`CSV ${file.name}`);
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  const elapsed = progress.started ? (performance.now() - progress.started) / 1000 : 0;
  const rate = progress.done && elapsed ? progress.done / elapsed : 0;
  const eta = rate ? (progress.total - progress.done) / rate : 0;
  const plannedCount =
    source === "testset" ? perCell * 2 * langs.length : source === "curated" ? CURATED.length : source === "paste" ? itemsFromPaste(paste).length : items?.length ?? 0;

  return (
    <div className="shell mx-auto w-full max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Evaluation bench"
        kicker="Bulk testing"
        accent="var(--red)"
        lead="Inject labelled sentences through the real model, watch every one get classified and explained, and get the numbers to show how well FairMod does — overall, per class and per language."
        actions={
          metrics ? (
            <>
              <button type="button" className="nb-btn" onClick={() => exportCsv(results)}>
                ↓ CSV
              </button>
              <button type="button" className="nb-btn" onClick={() => exportJson(results, metrics)}>
                ↓ JSON
              </button>
              <button type="button" className="nb-btn nb-btn--red" disabled={running} onClick={() => void save()}>
                Save run
              </button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
        {/* ── controls ── */}
        <aside className="space-y-6 xl:sticky xl:top-24">
          <section className="nb-card overflow-hidden">
            <StepHead n={1} title="Test data" />
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Data source">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={source === s.id}
                    onClick={() => setSource(s.id)}
                    className={`nb-btn nb-btn--sm whitespace-normal text-left ${source === s.id ? "nb-btn--ink" : ""}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-xs font-medium text-[var(--ink-muted)]">{SOURCES.find((s) => s.id === source)!.hint}</p>

              {source === "testset" && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="flex items-center justify-between text-sm font-bold">
                      Per language × label
                      <span className="rounded-md border-2 border-[var(--ink)] bg-[var(--red)] px-2 tabular-nums text-[var(--on-red)]">{perCell}</span>
                    </span>
                    <input type="range" min={1} max={100} value={perCell} onChange={(e) => setPerCell(+e.target.value)} className="nb-range mt-2" />
                  </label>
                  <div>
                    <p className="nb-label mb-1.5">Languages</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_LANGS.map((l) => {
                        const on = langs.includes(l);
                        return (
                          <button
                            key={l}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setLangs((xs) => (on ? xs.filter((x) => x !== l) : [...xs, l]))}
                            className={`nb-btn nb-btn--sm ${on ? "nb-btn--ink" : ""}`}
                          >
                            {LANG_NAMES[l]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="nb-label">
                    Random seed
                    <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 0)} className="nb-input mt-1.5 normal-case tracking-normal" />
                  </label>
                  {dataset && (
                    <p className="text-[0.7rem] font-medium text-[var(--ink-muted)]">
                      Pool: {dataset.total.toLocaleString()} labelled comments in processed/test.csv.
                    </p>
                  )}
                </div>
              )}

              {source === "csv" && (
                <label className="nb-btn w-full cursor-pointer">
                  ⇪ Choose CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onCsv(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              {source === "paste" && (
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={7}
                  placeholder={"abusive | तुम जैसे गधे को कोई अक्ल नहीं है।\nnormal | আজকের আবহাওয়া খুব সুন্দর।"}
                  className="nb-input indic resize-y text-sm leading-relaxed"
                />
              )}

              <p className="rounded-lg border-2 border-dashed border-[var(--ink)] px-3 py-2 text-sm font-bold">
                {plannedCount} item{plannedCount === 1 ? "" : "s"} ready
                {source === "csv" && items && itemsLabel.startsWith("CSV") ? ` · ${itemsLabel}` : ""}
              </p>
            </div>
          </section>

          <section className="nb-card overflow-hidden">
            <StepHead n={2} title="Run" />
            <div className="space-y-4 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--red)]" />
                <span className="text-sm">
                  <b>Word-level explanations</b>
                  <span className="block text-xs text-[var(--ink-muted)]">
                    Highlights every word (Integrated Gradients). ≈0.35 s per item on CPU; off is ~50× faster.
                  </span>
                </span>
              </label>
              <label className="nb-label">
                Run name (optional)
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Viva demo" className="nb-input mt-1.5 normal-case tracking-normal" />
              </label>
              {running ? (
                <button type="button" className="nb-btn nb-btn--ink w-full" onClick={() => abort.current?.abort()}>
                  ■ Stop
                </button>
              ) : (
                <button type="button" className="nb-btn nb-btn--red w-full py-3 text-base" disabled={!plannedCount} onClick={() => void run()}>
                  ▶ Run {plannedCount} through FairMod
                </button>
              )}
              {plannedCount > 0 && !running && (
                <p className="text-xs font-medium text-[var(--ink-muted)]">
                  Estimated {explain ? `~${Math.max(1, Math.round((plannedCount * 0.35) / 60 * 10) / 10)} min` : "a few seconds"}.
                </p>
              )}
            </div>
          </section>

          <section className="nb-card overflow-hidden">
            <StepHead n={3} title="Saved runs" />
            {runs.length === 0 ? (
              <p className="p-4 text-sm font-medium text-[var(--ink-muted)]">
                No saved runs yet. Save one, or use <code className="font-bold">python evaluate.py --save</code>.
              </p>
            ) : (
              <ul className="max-h-80 divide-y-2 divide-[var(--ink)] overflow-y-auto">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openRun(r.id)}>
                      <p className="truncate text-sm font-bold hover:underline">{r.name}</p>
                      <p className="text-[0.7rem] font-medium text-[var(--ink-muted)]">
                        {r.n} items · {timeAgo(r.created_at)}
                      </p>
                    </button>
                    <span className="rounded-md border-2 border-[var(--ink)] px-1.5 text-sm font-extrabold tabular-nums">
                      {r.metrics.macro_f1.toFixed(3)}
                    </span>
                    <button
                      type="button"
                      className="nb-btn nb-btn--sm"
                      aria-label={`Delete run ${r.name}`}
                      onClick={() => void evalApi.deleteRun(r.id).then(loadRuns).catch(fail)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* ── results ── */}
        <div className="min-w-0 space-y-6">
          {error && <ErrorBox>{error}</ErrorBox>}
          {notice && (
            <p className="nb-card reveal px-4 py-3 text-sm font-bold" role="status">
              ✓ {notice}
            </p>
          )}

          {(running || progress.total > 0) && !loadedRun && (
            <section className={`nb-card overflow-hidden ${running ? "" : "reveal"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
                <p className="display text-2xl font-extrabold">
                  {running ? "Classifying…" : progress.done < progress.total ? "Stopped" : "Done"}{" "}
                  <span className="tabular-nums text-[var(--red)]">
                    {progress.done}/{progress.total}
                  </span>
                </p>
                <p className="text-xs font-bold tabular-nums text-[var(--ink-muted)]">
                  {rate ? `${rate.toFixed(1)} items/s` : ""}
                  {running && eta ? ` · ~${Math.ceil(eta)} s left` : ""}
                </p>
              </div>
              <div className="mx-4 my-3 h-6 overflow-hidden rounded-lg border-[3px] border-[var(--ink)] bg-[var(--paper)]">
                <div
                  className="h-full border-r-[3px] border-[var(--ink)] bg-[var(--red)] transition-[width] duration-300"
                  style={{
                    width: `${progress.total ? Math.max(2, (progress.done / progress.total) * 100) : 0}%`,
                    backgroundImage: "repeating-linear-gradient(-45deg, transparent 0 10px, rgba(0,0,0,.15) 10px 20px)",
                  }}
                />
              </div>
              {running && current.length > 0 && (
                <div className="scanline border-t-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3">
                  <p className="mb-1 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--red)]">● Now processing</p>
                  <ul className="indic space-y-0.5 text-sm">
                    {current.map((c, i) => (
                      <li key={i} className="truncate">
                        {c.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {loadedRun && (
            <p className="nb-card reveal flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-bold">
              Viewing saved run {loadedRun}
              <span className="text-xs font-medium text-[var(--ink-muted)]">{runSource}</span>
            </p>
          )}

          {metrics ? (
            <>
              <Scoreboard m={metrics} running={running} />
              <ResultsTable results={results} newestFirst={running} />
            </>
          ) : (
            !running && <EmptyBench />
          )}
        </div>
      </div>
    </div>
  );
}

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[var(--paper)]">
      <span className="grid h-6 w-6 place-items-center rounded-md border-2 border-[var(--paper)] bg-[var(--red)] text-xs font-extrabold text-white">
        {n}
      </span>
      <h2 className="text-sm font-extrabold uppercase tracking-[0.1em]">{title}</h2>
    </div>
  );
}

function EmptyBench() {
  return (
    <section className="nb-card relative overflow-hidden p-8">
      <span className="nb-sticker absolute right-6 top-6 bg-[var(--red)] text-[var(--on-red)]">ready</span>
      <p className="display max-w-lg text-4xl font-extrabold leading-tight">Pick a test set, press run, watch it work.</p>
      <ol className="mt-5 max-w-lg list-inside list-decimal space-y-1.5 text-sm font-medium text-[var(--ink-soft)]">
        <li>Each sentence goes through the same model and explainer the app uses.</li>
        <li>Results stream in live — every word coloured by how much it pushed the verdict.</li>
        <li>The scoreboard shows macro-F1, the confusion matrix and a per-language breakdown.</li>
        <li>Save the run or export CSV / JSON for the report.</li>
      </ol>
      <p className="mt-5 text-xs font-medium text-[var(--ink-muted)]">
        Prefer a terminal? <code className="font-bold">python evaluate.py --sample 25 --save &quot;Viva demo&quot;</code>
      </p>
    </section>
  );
}
