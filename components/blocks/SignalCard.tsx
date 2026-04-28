import type { MessageBlock } from "@/db/schema";

type SignalBlock = Extract<MessageBlock, { type: "signal_card" }>;

const SOURCE_META: Record<
  string,
  { label: string; icon: string; cls: string }
> = {
  feedback: {
    label: "feedback",
    icon: "★",
    cls: "text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_18%,transparent)]",
  },
  errors: {
    label: "errors",
    icon: "!",
    cls: "text-[var(--err)] bg-[color-mix(in_srgb,var(--err)_15%,transparent)]",
  },
  chat_history: {
    label: "chat",
    icon: "⌽",
    cls: "text-[var(--agent)] bg-[color-mix(in_srgb,var(--agent)_15%,transparent)]",
  },
};

export function SignalCard({ block }: { block: SignalBlock }) {
  return (
    <div className="border border-[var(--border)] rounded-md bg-[var(--surface)] overflow-hidden max-w-[680px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">
          Signal card
        </span>
        <span className="ml-auto text-[11px] text-[var(--muted)] font-mono">
          {block.signals.length} sources
        </span>
      </div>
      <div className="px-3 py-2">
        {block.signals.map((s, i) => {
          const m = SOURCE_META[s.source] ?? {
            label: s.source,
            icon: "·",
            cls: "text-[var(--muted)] bg-[var(--surface-2)]",
          };
          return (
            <div
              key={s.id}
              className={`grid grid-cols-[20px_1fr_auto] gap-2.5 items-center py-1.5 ${
                i > 0 ? "border-t border-dashed border-[var(--border)]" : ""
              }`}
            >
              <div
                className={`w-[18px] h-[18px] rounded grid place-items-center text-[10px] font-bold ${m.cls}`}
              >
                {m.icon}
              </div>
              <div className="text-[13px] text-[var(--foreground)] min-w-0 truncate">
                {s.label}
              </div>
              <div className="text-[11px] text-[var(--muted)] font-mono whitespace-nowrap">
                {m.label} · {s.occurredAt}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
