import type { MessageBlock } from "@/db/schema";

type FileBlock = Extract<MessageBlock, { type: "file_ref" }>;

export function FileRef({ block }: { block: FileBlock }) {
  const range =
    block.lineStart && block.lineEnd
      ? `:${block.lineStart}-${block.lineEnd}`
      : block.lineStart
        ? `:${block.lineStart}`
        : "";
  return (
    <code className="inline-flex items-center gap-1.5 text-[12px] font-mono px-[7px] py-[2px] rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)]">
      {block.path}
      <span className="text-[var(--muted)]">{range}</span>
    </code>
  );
}
