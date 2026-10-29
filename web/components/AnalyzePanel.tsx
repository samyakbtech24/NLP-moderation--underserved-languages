"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import {
  ApiError,
  EXAMPLES,
  MAX_CHARS,
  classifyText,
} from "@/lib/api";
import type { ClassifyResponse, HighlightFilter } from "@/lib/types";
import { VerdictPanel, VerdictSkeleton } from "./VerdictPanel";

type Props = {
  seedText?: string;
  seedNonce?: number;
  onResult?: (result: ClassifyResponse | null) => void;
};

const CHIP_BG: Record<string, string> = {
  Hindi: "var(--sun)",
  Kannada: "var(--pink)",
  Marathi: "var(--sky)",
  Bengali: "var(--violet-soft)",
};

export function AnalyzePanel({ seedText, seedNonce, onResult }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HighlightFilter>("all");
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (seedText == null || seedNonce == null) return;
    setText(seedText);
    void runClassify(seedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  async function runClassify(value: string) {
    const trimmed = value.trim();
    setError(null);
    setFilter("all");
    if (!trimmed) {
      setError("Type or paste a comment first.");
      setResult(null);
      onResult?.(null);
      return;
    }
    setLoading(true);
    try {
      const data = await classifyText(trimmed);
      startTransition(() => {
        setResult(data);
        onResult?.(data);
      });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please try again.";
      setResult(null);
      onResult?.(null);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void runClassify(text);
    }
  }

  const nearLimit = text.length > MAX_CHARS * 0.9;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-5">
        <div className="nb-card overflow-hidden">
          <div className="flex items-center justify-between border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-[var(--paper)]">
            <label htmlFor={labelId} className="text-sm font-bold uppercase tracking-[0.12em]">
              Comment
            </label>
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[var(--coral)]" />
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[var(--sun)]" />
              <span className="h-3 w-3 rounded-full border-2 border-[var(--ink)] bg-[var(--mint)]" />
            </span>
          </div>
          <div className="p-4 md:p-5">
            <textarea
              id={labelId}
              ref={areaRef}
              value={text}
              maxLength={MAX_CHARS}
              rows={6}
              placeholder="Paste a comment in Hindi, Kannada, Marathi, or Bengali…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              className="nb-input indic resize-y text-lg leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-medium">
              <p className="text-[var(--ink-muted)]">
                <kbd>Enter</kbd> to analyze · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
              </p>
              <p className={`tabular-nums ${nearLimit ? "font-bold text-[var(--coral-ink)]" : "text-[var(--ink-muted)]"}`}>
                {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </p>
            </div>
            <div className="sticky-cta mt-4">
              <button
                type="button"
                disabled={loading}
                onClick={() => void runClassify(text)}
                className="nb-btn nb-btn--ink w-full py-3 text-base md:w-auto md:min-w-[11rem]"
              >
                {loading ? "Analyzing…" : "Analyze →"}
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="nb-label mb-2">Try an example</p>
          <div className="flex flex-wrap gap-2.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.lang}
                type="button"
                onClick={() => {
                  setText(ex.text);
                  areaRef.current?.focus();
                }}
                className="nb-btn nb-btn--sm wiggle-hover"
                style={{ background: CHIP_BG[ex.lang] }}
              >
                {ex.lang}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="nb-card reveal !bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium" role="alert">
            <p>{error}</p>
            <button type="button" className="nb-btn nb-btn--sm mt-2" onClick={() => void runClassify(text)}>
              Retry
            </button>
          </div>
        )}
      </div>

      <div>
        {loading || pending ? (
          <VerdictSkeleton />
        ) : result ? (
          <VerdictPanel result={result} filter={filter} onFilterChange={setFilter} />
        ) : (
          <EmptyResult />
        )}
      </div>
    </div>
  );
}

function EmptyResult() {
  return (
    <section className="nb-card relative flex min-h-[280px] flex-col justify-center overflow-hidden bg-[var(--mint-soft)] p-7">
      <span className="nb-sticker absolute right-5 top-5 bg-[var(--sun)]" aria-hidden>
        waiting
      </span>
      <p className="display text-4xl font-extrabold leading-none">Drop a comment in.</p>
      <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed">
        You&apos;ll get a verdict, a confidence score and every word coloured by how hard it pushed the model —{" "}
        <mark className="rounded border-2 border-[var(--ink)] bg-[var(--coral-soft)] px-1">red</mark> toward abusive,{" "}
        <mark className="rounded border-2 border-[var(--ink)] bg-[var(--mint-soft)] px-1">gray</mark> toward normal.
      </p>
    </section>
  );
}
