"use client";

import { useEffect, useState } from "react";

type ProposedEdit = {
  id: string;
  taskId: string;
  status: "pending" | "approved" | "rejected";
  task: { externalId: string; title: string };
  diff: {
    rationale: string;
    changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    attachedQuote?: string;
    fileRefs?: string[];
  };
};

type Listener = () => void;
const decisionListeners = new Set<Listener>();
export function onEditDecision(fn: Listener) {
  decisionListeners.add(fn);
  return () => {
    decisionListeners.delete(fn);
  };
}
function emitDecision() {
  for (const fn of decisionListeners) fn();
}

export function EditCard({ editId }: { editId: string }) {
  const [edit, setEdit] = useState<ProposedEdit | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/edits/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEdit(d);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  async function decide(action: "apply" | "reject") {
    if (!edit) return;
    setLoading(true);
    const res = await fetch(`/api/edits/${editId}/${action}`, {
      method: "POST",
    });
    if (res.ok) {
      const updated = await res.json();
      setEdit(updated);
      emitDecision();
    }
    setLoading(false);
  }

  if (!edit) {
    return (
      <div className="border border-[var(--border)] rounded-md bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--muted)] max-w-[680px]">
        Loading proposed edit…
      </div>
    );
  }

  const decided = edit.status !== "pending";

  return (
    <div className="border border-[var(--border)] rounded-md bg-[var(--surface)] overflow-hidden max-w-[680px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">
          Edit
        </span>
        <span className="font-mono text-[12px] text-[var(--foreground)]">
          {edit.task.externalId}
        </span>
        <span className="text-[var(--muted)] text-[11px]">·</span>
        <span className="text-[12px] text-[var(--foreground)] truncate">
          {edit.task.title}
        </span>
        {decided ? (
          <span
            className={`ml-auto text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded ${
              edit.status === "approved"
                ? "text-[var(--ok)]"
                : "text-[var(--err)]"
            }`}
            style={{
              background:
                edit.status === "approved"
                  ? "color-mix(in srgb,var(--ok) 18%,transparent)"
                  : "color-mix(in srgb,var(--err) 15%,transparent)",
            }}
          >
            {edit.status}
          </span>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              disabled={loading}
              onClick={() => decide("reject")}
              className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]/80 hover:bg-[var(--surface-3)] disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
            <button
              disabled={loading}
              onClick={() => decide("apply")}
              className="text-[11px] px-2 py-1 rounded font-semibold border transition-colors disabled:opacity-50"
              style={{
                background: "var(--ok)",
                color: "#0e0f12",
                borderColor: "var(--ok)",
              }}
            >
              ✓ Apply
            </button>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5">
        {edit.diff.rationale && (
          <div className="text-[12px] text-[var(--muted)] mb-2 leading-snug">
            {edit.diff.rationale}
          </div>
        )}

        <div className="space-y-1.5">
          {edit.diff.changes.map((c, i) => (
            <div
              key={i}
              className="border border-[var(--border)] rounded bg-[var(--surface-2)] overflow-hidden"
            >
              <div className="px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)] border-b border-[var(--border)] font-mono normal-case">
                {c.field}
              </div>
              <div
                className="font-mono text-[12px] leading-[1.55]"
                style={{ background: "var(--diff-del-bg)" }}
              >
                <div className="grid grid-cols-[28px_1fr]">
                  <div className="text-right pr-2 text-[var(--err)] border-r border-[var(--border)] select-none">
                    −
                  </div>
                  <pre className="px-2.5 whitespace-pre-wrap break-words text-[var(--foreground)]/85">
                    {fmt(c.oldValue)}
                  </pre>
                </div>
              </div>
              <div
                className="font-mono text-[12px] leading-[1.55]"
                style={{ background: "var(--diff-add-bg)" }}
              >
                <div className="grid grid-cols-[28px_1fr]">
                  <div className="text-right pr-2 text-[var(--ok)] border-r border-[var(--border)] select-none">
                    +
                  </div>
                  <pre className="px-2.5 whitespace-pre-wrap break-words text-[var(--foreground)]">
                    {fmt(c.newValue)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {edit.diff.attachedQuote && (
          <blockquote className="text-[12px] text-[var(--muted)] border-l-2 border-[var(--border)] pl-3 mt-2.5 italic">
            {edit.diff.attachedQuote}
          </blockquote>
        )}
      </div>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}
