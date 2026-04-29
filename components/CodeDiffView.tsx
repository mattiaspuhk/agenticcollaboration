"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DiffEntry = {
  path: string;
  kind: "add" | "modify" | "delete";
  patch: string;
  stats: { added: number; removed: number };
};

type RunPayload = {
  run: {
    id: string;
    featureId: string;
    status: "running" | "awaiting_review" | "applied" | "rejected" | "error";
    branchName: string;
    baseBranch: string;
    prTitle: string | null;
    prBody: string | null;
    prNumber: number | null;
    prUrl: string | null;
    errorMessage: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  feature: {
    id: string;
    slug: string;
    title: string;
    githubRepo: string | null;
    branchName: string | null;
  } | null;
  diffs: DiffEntry[];
};

export function CodeDiffView({
  runId,
  projectSlug,
  featureKey,
}: {
  runId: string;
  projectSlug: string;
  featureKey: string;
}) {
  const [data, setData] = useState<RunPayload | null>(null);
  const [selected, setSelected] = useState(0);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}`).then(async (r) => {
      if (!r.ok || cancelled) return;
      const body = (await r.json()) as RunPayload;
      setData(body);
      setPrTitle(body.run.prTitle ?? body.feature?.title ?? "");
      setPrBody(body.run.prBody ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const totalStats = useMemo(() => {
    if (!data) return { added: 0, removed: 0 };
    return data.diffs.reduce(
      (acc, d) => ({
        added: acc.added + d.stats.added,
        removed: acc.removed + d.stats.removed,
      }),
      { added: 0, removed: 0 },
    );
  }, [data]);

  async function approve() {
    if (busy || !data) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prTitle, prBody }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error ?? "approve failed");
        return;
      }
      // Reload the page to show applied state.
      window.location.href = `/projects/${projectSlug}/f/${featureKey}`;
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (busy) return;
    if (!confirm("Reject this build? The agent's changes will be discarded.")) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/runs/${runId}/reject`, { method: "POST" });
      window.location.href = `/projects/${projectSlug}/f/${featureKey}`;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted)]">
        Loading run…
      </div>
    );
  }

  const status = data.run.status;
  const reviewable = status === "awaiting_review";
  const diffs = data.diffs;
  const sel = diffs[selected];

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[var(--background)] overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
        <Link
          href={`/projects/${projectSlug}/f/${featureKey}`}
          className="text-[12px] text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {data.feature?.title ?? "Feature"}
        </Link>
        <span
          className="text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-px rounded border"
          style={statusStyle(status)}
        >
          {prettyStatus(status)}
        </span>
        <code className="text-[11px] font-mono text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-px">
          {data.run.branchName} ← {data.run.baseBranch}
        </code>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="text-[var(--ok)] font-mono tabular-nums">
            +{totalStats.added}
          </span>
          <span className="text-[var(--err)] font-mono tabular-nums">
            -{totalStats.removed}
          </span>
          <span className="text-[var(--muted)]">
            · {diffs.length} file{diffs.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {data.run.errorMessage && (
        <div className="px-5 py-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--err)_8%,transparent)] text-[12.5px] text-[var(--foreground)]/85">
          <span className="text-[var(--err)] font-semibold">Error:</span>{" "}
          {data.run.errorMessage}
        </div>
      )}

      {data.run.prUrl && data.run.prNumber && (
        <div className="px-5 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]/40 text-[12.5px]">
          PR opened:{" "}
          <a
            href={data.run.prUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] font-mono hover:underline"
          >
            #{data.run.prNumber} {data.run.prTitle}
          </a>
        </div>
      )}

      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--surface)] grid grid-cols-[1fr_auto] gap-3 items-start">
        <div className="space-y-2">
          <input
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            disabled={!reviewable}
            placeholder="PR title"
            className="w-full text-[14px] font-semibold bg-transparent border border-[var(--border-strong)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-70"
          />
          <textarea
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            disabled={!reviewable}
            placeholder="PR body (markdown)"
            rows={4}
            className="w-full text-[12.5px] bg-transparent border border-[var(--border)] rounded px-2 py-1.5 font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-70"
          />
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {reviewable ? (
            <>
              <button
                onClick={approve}
                disabled={busy}
                className="px-3.5 py-2 text-[12px] font-semibold rounded transition-colors disabled:opacity-50"
                style={{ background: "var(--ok)", color: "white" }}
              >
                {busy ? "Working…" : "Approve & open PR"}
              </button>
              <button
                onClick={reject}
                disabled={busy}
                className="px-3.5 py-2 text-[12px] font-medium rounded transition-colors disabled:opacity-50"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--err)",
                  border: "1px solid var(--border-strong)",
                }}
              >
                Reject
              </button>
            </>
          ) : (
            <Link
              href={`/projects/${projectSlug}/f/${featureKey}`}
              className="px-3.5 py-2 text-[12px] font-medium rounded text-center"
              style={{
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--border-strong)",
              }}
            >
              Close
            </Link>
          )}
        </div>
      </div>

      {err && (
        <div className="px-5 py-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--err)_8%,transparent)] text-[12px] text-[var(--err)]">
          {err}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <aside className="w-[260px] shrink-0 border-r border-[var(--border)] overflow-y-auto bg-[var(--surface-2)]/30">
          {diffs.length === 0 && (
            <div className="px-4 py-3 text-[12px] text-[var(--muted)]">
              No file changes in this run.
            </div>
          )}
          {diffs.map((d, i) => (
            <button
              key={d.path}
              onClick={() => setSelected(i)}
              className={`w-full text-left px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface)] ${
                selected === i ? "bg-[var(--surface)]" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                <span style={{ color: kindColor(d.kind) }}>{d.kind}</span>
                <span className="ml-auto font-mono">
                  <span className="text-[var(--ok)]">+{d.stats.added}</span>{" "}
                  <span className="text-[var(--err)]">-{d.stats.removed}</span>
                </span>
              </div>
              <div className="text-[12px] font-mono mt-0.5 break-all leading-snug">
                {d.path}
              </div>
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 overflow-auto">
          {sel ? (
            <DiffPane diff={sel} />
          ) : (
            <div className="px-6 py-12 text-[12.5px] text-[var(--muted)]">
              Select a file to view its diff.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DiffPane({ diff }: { diff: DiffEntry }) {
  const lines = diff.patch.split(/\n/);
  return (
    <pre className="px-0 py-0 text-[12px] font-mono leading-[1.55] whitespace-pre">
      {lines.map((line, i) => {
        const cls = lineClass(line);
        return (
          <div
            key={i}
            className={`px-4 ${cls} min-w-fit`}
          >
            {line || "\u00A0"}
          </div>
        );
      })}
    </pre>
  );
}

function lineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "text-[var(--muted)] bg-[var(--surface-2)]/40";
  }
  if (line.startsWith("@@")) {
    return "text-[var(--accent)] bg-[var(--surface-2)]/60";
  }
  if (line.startsWith("+")) {
    return "text-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]";
  }
  if (line.startsWith("-")) {
    return "text-[var(--err)] bg-[color-mix(in_srgb,var(--err)_8%,transparent)]";
  }
  if (line.startsWith("\\")) {
    return "text-[var(--muted)] italic";
  }
  return "text-[var(--foreground)]/85";
}

function kindColor(kind: "add" | "modify" | "delete") {
  if (kind === "add") return "var(--ok)";
  if (kind === "delete") return "var(--err)";
  return "var(--accent)";
}

function statusStyle(status: string): React.CSSProperties {
  if (status === "awaiting_review") {
    return {
      color: "var(--ok)",
      borderColor: "color-mix(in srgb,var(--ok) 40%,transparent)",
      background: "color-mix(in srgb,var(--ok) 10%,transparent)",
    };
  }
  if (status === "applied") {
    return {
      color: "var(--agent)",
      borderColor: "color-mix(in srgb,var(--agent) 40%,transparent)",
      background: "color-mix(in srgb,var(--agent) 10%,transparent)",
    };
  }
  if (status === "error") {
    return {
      color: "var(--err)",
      borderColor: "color-mix(in srgb,var(--err) 40%,transparent)",
      background: "color-mix(in srgb,var(--err) 10%,transparent)",
    };
  }
  return {
    color: "var(--muted)",
    borderColor: "var(--border)",
    background: "var(--surface-2)",
  };
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ");
}
