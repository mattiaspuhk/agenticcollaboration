import { Tile } from "./Tile";
import type { TileVisual } from "@/lib/tiles";
import type { FeatureBlocker } from "@/db/schema";

export function BlockersTile({
  blockers,
  visual,
}: {
  blockers: FeatureBlocker[];
  visual: TileVisual;
}) {
  if (blockers.length === 0) {
    return (
      <Tile title="Blockers" visual={visual} accent="var(--err)">
        <p className="text-[var(--muted)] italic text-[12px]">No blockers.</p>
      </Tile>
    );
  }
  return (
    <Tile
      title="Blockers"
      badge={`${blockers.length}`}
      visual={visual}
      accent="var(--err)"
    >
      <ul className="space-y-1.5">
        {blockers.map((b) => (
          <li
            key={b.id}
            className="text-[12.5px] border-l-2 pl-2 leading-snug"
            style={{ borderColor: "var(--err)" }}
          >
            {b.body}
          </li>
        ))}
      </ul>
    </Tile>
  );
}
