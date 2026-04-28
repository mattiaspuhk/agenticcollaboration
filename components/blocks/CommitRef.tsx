import type { MessageBlock } from "@/db/schema";

type CommitBlock = Extract<MessageBlock, { type: "commit_ref" }>;

export function CommitRef({ block }: { block: CommitBlock }) {
  return (
    <div className="border border-[var(--border)] rounded-md bg-[var(--surface)] overflow-hidden max-w-[680px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">
          Commit
        </span>
        {block.commitId && (
          <span className="ml-auto text-[11px] text-[var(--muted)] font-mono">
            #{block.commitId.slice(0, 4)}
          </span>
        )}
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr_auto] gap-3 items-center">
        <span
          className="font-mono text-[12px] text-[var(--accent)] px-1.5 py-0.5 rounded"
          style={{ background: "var(--accent-soft)" }}
        >
          {block.sha.slice(0, 7)}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] text-[var(--foreground)] truncate">
            {block.summary}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-px">
            {block.author}
          </div>
        </div>
        <button className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] rounded px-2 py-1 transition-colors">
          open diff →
        </button>
      </div>
    </div>
  );
}
