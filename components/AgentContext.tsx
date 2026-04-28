"use client";

import { useEffect, useState } from "react";

type ToolCall = { id: string; name: string; status: "running" | "ok" | "err" };

export type AgentEvent =
  | { kind: "tool_call"; name: string }
  | { kind: "tool_done" }
  | { kind: "run_start" }
  | { kind: "run_end" };

export function dispatchAgentEvent(e: AgentEvent) {
  window.dispatchEvent(new CustomEvent("agent:event", { detail: e }));
}

export function AgentContext({
  projectName,
  branch = "main",
}: {
  projectName: string;
  branch?: string;
}) {
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [running, setRunning] = useState(false);
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    function on(ev: Event) {
      const detail = (ev as CustomEvent<AgentEvent>).detail;
      if (detail.kind === "run_start") {
        setRunning(true);
        setTools([]);
      } else if (detail.kind === "run_end") {
        setRunning(false);
        setTools((prev) =>
          prev.map((t) => (t.status === "running" ? { ...t, status: "ok" } : t)),
        );
      } else if (detail.kind === "tool_call") {
        setTools((prev) => {
          const finalized = prev.map((t) =>
            t.status === "running" ? { ...t, status: "ok" as const } : t,
          );
          return [
            ...finalized,
            {
              id: `${Date.now()}-${detail.name}`,
              name: detail.name,
              status: "running",
            },
          ];
        });
        setTokens((t) => t + Math.floor(800 + Math.random() * 600));
      } else if (detail.kind === "tool_done") {
        setTools((prev) =>
          prev.map((t) =>
            t.status === "running" ? { ...t, status: "ok" } : t,
          ),
        );
      }
    }
    window.addEventListener("agent:event", on);
    return () => window.removeEventListener("agent:event", on);
  }, []);

  const ctxPct = Math.min(100, Math.round((tokens / 200_000) * 100));

  return (
    <aside className="w-[300px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col min-w-0">
      <div className="px-3.5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--agent)",
            boxShadow: running ? "0 0 8px var(--agent)" : "none",
          }}
        />
        <div className="text-[13px] font-semibold">Agent context</div>
        <div className="ml-auto flex gap-px text-[11px]">
          <span className="px-1.5 py-0.5 rounded text-[var(--foreground)] bg-[var(--surface-2)]">
            Live
          </span>
          <span className="px-1.5 py-0.5 rounded text-[var(--muted)]">
            History
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <Section
          title="Project"
          right={
            <span className="text-[10px] text-[var(--ok)] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" /> ready
            </span>
          }
        >
          <Row label="name" value={projectName} mono={false} />
          <Row label="branch" value={branch} />
          <Row label="indexed" value="codebase · docs · git" mono={false} />
        </Section>

        <Section title="Tools called">
          {tools.length === 0 ? (
            <div className="text-[11px] text-[var(--muted)] italic py-1">
              {running
                ? "agent starting…"
                : "no calls yet — send a message and watch this populate"}
            </div>
          ) : (
            tools.map((t, i) => (
              <div
                key={t.id}
                className={`grid grid-cols-[1fr_auto] gap-2 items-center py-1 ${
                  i > 0 ? "border-t border-dashed border-[var(--border)]" : ""
                }`}
              >
                <span className="font-mono text-[12px] text-[var(--foreground)]/90 truncate">
                  {t.name}()
                </span>
                <ToolStatus status={t.status} />
              </div>
            ))
          )}
        </Section>

        <Section
          title="Token budget"
          right={
            <span className="font-mono text-[10px] text-[var(--muted)]">
              {ctxPct}%
            </span>
          }
        >
          <div className="grid grid-cols-[1fr_auto] gap-2 text-[11px] text-[var(--foreground)]/80 items-center mb-1">
            <span>Used this thread</span>
            <span className="font-mono text-[var(--muted)]">
              {tokens.toLocaleString()} / 200k
            </span>
          </div>
          <div className="h-1 bg-[var(--surface-2)] rounded-sm overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.max(2, ctxPct)}%`,
                background:
                  "linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 60%,#fb7185))",
              }}
            />
          </div>
        </Section>

        <Section title="Latest action">
          <div className="text-[12px] text-[var(--foreground)]/85 bg-[var(--surface-2)] border border-[var(--border)] rounded-md px-2.5 py-2 leading-snug">
            {running ? (
              <>
                <span className="text-[var(--agent)]">▸</span> running…
                <div className="text-[11px] text-[var(--muted)] mt-1">
                  streaming tokens, calling tools
                </div>
              </>
            ) : tools.length > 0 ? (
              <>
                <span className="text-[var(--ok)]">●</span> last run completed
                <div className="text-[11px] text-[var(--muted)] mt-1">
                  {tools.length} tool call{tools.length === 1 ? "" : "s"}
                </div>
              </>
            ) : (
              <span className="text-[var(--muted)] italic">
                idle — agent reacts when you @mention it or send a message
              </span>
            )}
          </div>
        </Section>
      </div>

      <div className="px-3.5 py-2.5 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>
          ctx <b className="text-[var(--foreground)]">{tokens.toLocaleString()}</b>
        </span>
        <span className="text-[var(--ok)] font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" /> all green
        </span>
      </div>
    </aside>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3.5 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-center mb-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold">
        <span>{title}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2 text-[11px] py-0.5">
      <span className="text-[var(--muted)]">{label}</span>
      <span
        className={`text-[var(--foreground)]/90 truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ToolStatus({ status }: { status: ToolCall["status"] }) {
  if (status === "running") {
    return (
      <span className="text-[10px] text-[var(--warn)] font-semibold flex items-center gap-1">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--warn)]"
          style={{ boxShadow: "0 0 6px var(--warn)" }}
        />
        running
      </span>
    );
  }
  if (status === "err") {
    return (
      <span className="text-[10px] text-[var(--err)] font-semibold flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--err)]" />
        err
      </span>
    );
  }
  return (
    <span className="text-[10px] text-[var(--ok)] font-semibold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
      ok
    </span>
  );
}
