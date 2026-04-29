"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type BuildRunSummary = {
  id: string;
  status: "running" | "awaiting_review" | "applied" | "rejected" | "error";
  branchName: string;
  baseBranch: string;
  prTitle: string | null;
  prNumber: number | null;
  prUrl: string | null;
  changeCount: number;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type ToolEntry = {
  type: "tool";
  name: string;
  arg: string;
  ok: boolean;
};

type StreamLine = ToolEntry | { type: "text"; text: string };

export function BuildPanel({
  featureId,
  projectSlug,
  featureKey,
  run,
  onChanged,
}: {
  featureId: string;
  projectSlug: string;
  featureKey: string;
  run: BuildRunSummary | null;
  onChanged: () => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the stream as new lines arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  // If a run is already running on mount (no SSE active locally), reflect that.
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  function start() {
    if (streaming) return;
    setLines([]);
    setErr(null);
    setStreaming(true);
    const es = new EventSource(`/api/features/${featureId}/build`);
    esRef.current = es;
    es.addEventListener("token", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { text: string };
      setLines((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.type === "text") {
          return [...prev.slice(0, -1), { type: "text", text: last.text + data.text }];
        }
        return [...prev, { type: "text", text: data.text }];
      });
    });
    es.addEventListener("tool_call", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        name: string;
        arg: string;
      };
      setLines((prev) => [
        ...prev,
        { type: "tool", name: data.name, arg: data.arg, ok: true },
      ]);
    });
    es.addEventListener("tool_result", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        name: string;
        ok: boolean;
        preview: string;
      };
      setLines((prev) => {
        // Mark the most recent tool entry of this name as ok/not-ok.
        for (let i = prev.length - 1; i >= 0; i--) {
          const x = prev[i];
          if (x.type === "tool" && x.name === data.name) {
            const next = [...prev];
            next[i] = { ...x, ok: data.ok };
            return next;
          }
        }
        return prev;
      });
    });
    es.addEventListener("error", () => {
      setStreaming(false);
      es.close();
      onChanged();
    });
    es.addEventListener("done", () => {
      setStreaming(false);
      es.close();
      onChanged();
    });
  }

  if (!run && !streaming) {
    return (
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
        <div className="flex items-center gap-3">
          <button
            onClick={start}
            className="px-3 py-1.5 text-[12px] font-semibold rounded transition-colors"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Start build
          </button>
          <span className="text-[11.5px] text-[var(--muted)]">
            Hand the agreed plan to the agent. It will read the codebase, propose file changes, and let you review before opening a PR.
          </span>
        </div>
        {err && (
          <div className="mt-2 text-[12px] text-[var(--err)]">{err}</div>
        )}
      </div>
    );
  }

  if (run?.status === "awaiting_review") {
    return (
      <div className="px-5 py-3 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-px rounded"
            style={{
              color: "var(--ok)",
              background: "color-mix(in srgb,var(--ok) 12%,transparent)",
            }}
          >
            Build ready
          </span>
          <div className="text-[13px] font-medium truncate flex-1 min-w-0">
            {run.prTitle ?? "Untitled build"}
          </div>
          <Link
            href={`/projects/${projectSlug}/f/${featureKey}/runs/${run.id}`}
            className="px-3 py-1.5 text-[12px] font-semibold rounded transition-colors"
            style={{ background: "var(--ok)", color: "white" }}
          >
            Review {run.changeCount} file change{run.changeCount === 1 ? "" : "s"} →
          </Link>
          <button
            onClick={start}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            re-run
          </button>
        </div>
      </div>
    );
  }

  if (run?.status === "applied") {
    return (
      <div className="px-5 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/40 text-[12px] text-[var(--muted)] flex items-center gap-3">
        <span className="text-[var(--agent)] font-semibold">PR opened:</span>
        {run.prUrl && run.prNumber ? (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] font-mono hover:underline"
          >
            #{run.prNumber} {run.prTitle}
          </a>
        ) : (
          <span>{run.prTitle}</span>
        )}
        <button
          onClick={start}
          className="ml-auto text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          start another build
        </button>
      </div>
    );
  }

  if (run?.status === "rejected") {
    return (
      <div className="px-5 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/40 text-[12px] text-[var(--muted)] flex items-center gap-3">
        Last build was rejected.
        <button
          onClick={start}
          className="ml-auto text-[11px] text-[var(--accent)] hover:underline font-medium"
        >
          Start a new build
        </button>
      </div>
    );
  }

  if (run?.status === "error" && !streaming) {
    return (
      <div className="px-5 py-2 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--err)_6%,transparent)] text-[12px] flex items-start gap-3">
        <span className="text-[var(--err)] font-semibold shrink-0">Build failed:</span>
        <span className="text-[var(--foreground)]/85 flex-1 break-words">
          {run.errorMessage ?? "unknown error"}
        </span>
        <button
          onClick={start}
          className="text-[11px] text-[var(--accent)] hover:underline font-medium shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  // Streaming live or run.status === "running"
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
      <div className="px-5 py-2 border-b border-[var(--border)] flex items-center gap-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--agent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--agent)] animate-pulse" />
          Build agent working
        </span>
        <span className="text-[var(--muted)] ml-auto font-mono">
          branch <code className="bg-[var(--surface)] border border-[var(--border)] px-1 rounded">{run?.branchName ?? "(pending)"}</code>
        </span>
      </div>
      <div
        ref={scrollRef}
        className="px-5 py-2 max-h-[220px] overflow-y-auto text-[12px] font-mono leading-relaxed space-y-1"
      >
        {lines.length === 0 && (
          <div className="text-[var(--muted)] italic">Spinning up…</div>
        )}
        {lines.map((l, i) => {
          if (l.type === "tool") {
            return (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="text-[10px] uppercase tracking-wide px-1 rounded"
                  style={{
                    color: l.ok ? "var(--ok)" : "var(--err)",
                    background: l.ok
                      ? "color-mix(in srgb,var(--ok) 10%,transparent)"
                      : "color-mix(in srgb,var(--err) 10%,transparent)",
                  }}
                >
                  {l.name}
                </span>
                <span className="text-[var(--foreground)]/80 break-all">
                  {l.arg}
                </span>
              </div>
            );
          }
          return (
            <div
              key={i}
              className="text-[var(--foreground)]/85 whitespace-pre-wrap break-words"
            >
              {l.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
