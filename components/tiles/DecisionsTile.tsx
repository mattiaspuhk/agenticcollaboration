import { Tile } from "./Tile";
import type { TileVisual } from "@/lib/tiles";

type DecisionView = {
  id: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
};

export function DecisionsTile({
  decisions,
  visual,
}: {
  decisions: DecisionView[];
  visual: TileVisual;
}) {
  if (decisions.length === 0) {
    return (
      <Tile title="Decisions" visual={visual}>
        <p className="text-[var(--muted)] italic text-[12px]">
          No decisions logged yet.
        </p>
      </Tile>
    );
  }
  return (
    <Tile title="Decisions" badge={`${decisions.length}`} visual={visual}>
      <ul className="space-y-1.5">
        {decisions.slice(0, 6).map((d) => (
          <li key={d.id} className="text-[12.5px] flex items-start gap-2">
            <span
              className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: d.resolvedAt ? "var(--ok)" : "var(--warn)",
              }}
            />
            <span className="leading-snug">
              {d.body}
              {d.resolvedAt && (
                <span className="text-[10px] text-[var(--muted)] ml-1.5">
                  resolved
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
