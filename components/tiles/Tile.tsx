import type { ReactNode } from "react";
import type { TileVisual } from "@/lib/tiles";

export function Tile({
  title,
  badge,
  visual,
  children,
  accent,
  collapsedSummary,
}: {
  title: string;
  badge?: string;
  visual: TileVisual;
  children: ReactNode;
  accent?: string;
  collapsedSummary?: ReactNode;
}) {
  if (visual === "hidden") return null;

  const wide =
    visual === "hero" || visual === "summarized" || visual === "collapsed";

  return (
    <section
      className={`rounded-lg border bg-[var(--surface)] flex flex-col min-w-0 ${
        wide ? "col-span-2" : "col-span-1"
      }`}
      style={{
        borderColor: accent
          ? `color-mix(in srgb,${accent} 35%,var(--border))`
          : "var(--border)",
      }}
    >
      <header className="px-3.5 py-2 border-b border-[var(--border)] flex items-center gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">
          {title}
        </h3>
        {badge && (
          <span
            className="text-[10px] font-semibold px-1.5 py-px rounded border"
            style={{
              color: accent ?? "var(--muted)",
              borderColor: accent
                ? `color-mix(in srgb,${accent} 40%,transparent)`
                : "var(--border)",
              background: accent
                ? `color-mix(in srgb,${accent} 10%,transparent)`
                : "var(--surface-2)",
            }}
          >
            {badge}
          </span>
        )}
        {visual === "collapsed" && (
          <span className="text-[10px] text-[var(--muted)] ml-auto italic">
            collapsed for you
          </span>
        )}
        {visual === "summarized" && (
          <span className="text-[10px] text-[var(--muted)] ml-auto italic">
            summarized
          </span>
        )}
      </header>
      <div className="px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--foreground)]">
        {visual === "collapsed" && collapsedSummary ? (
          <details>
            <summary className="cursor-pointer text-[var(--muted)] text-[12px]">
              {collapsedSummary}
            </summary>
            <div className="mt-2">{children}</div>
          </details>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
