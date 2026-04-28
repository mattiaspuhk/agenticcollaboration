import { Tile } from "./Tile";
import type { TileVisual } from "@/lib/tiles";
import type { DiscoveryDigest } from "@/db/schema";

export function DiscoveryDigestTile({
  digest,
  visual,
}: {
  digest: DiscoveryDigest | null;
  visual: TileVisual;
}) {
  if (!digest) {
    return (
      <Tile title="Discovery digest" visual={visual} accent="var(--agent)">
        <p className="text-[var(--muted)] italic text-[12px]">
          No discovery digest. This feature was created without graduating from a
          discovery thread.
        </p>
      </Tile>
    );
  }

  return (
    <Tile
      title="Discovery digest"
      badge="why we're building this"
      visual={visual}
      accent="var(--agent)"
    >
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-1">
            Framed problem
          </div>
          <p className="text-[13px] leading-snug">{digest.framedProblem}</p>
        </div>
        {digest.keyContext.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-1">
              Key context
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              {digest.keyContext.map((ctx, i) => (
                <li key={i} className="text-[12.5px]">
                  {ctx}
                </li>
              ))}
            </ul>
          </div>
        )}
        {digest.sourceQuotes.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-1">
              Source quotes
            </div>
            <ul className="space-y-1.5">
              {digest.sourceQuotes.map((q, i) => (
                <li
                  key={i}
                  className="text-[12.5px] italic border-l-2 pl-2.5 border-[var(--border-strong)] text-[var(--foreground)]/80"
                >
                  &ldquo;{q}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Tile>
  );
}
