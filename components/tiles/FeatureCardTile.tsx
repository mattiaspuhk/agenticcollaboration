import { Tile } from "./Tile";
import type { TileVisual, FeatureCardTilePayload } from "@/lib/tiles";

export function FeatureCardTile({
  payload,
  visual,
  fallbackTitle,
}: {
  payload: FeatureCardTilePayload | null;
  visual: TileVisual;
  fallbackTitle: string;
}) {
  return (
    <Tile
      title="What's coming"
      visual={visual}
      accent="var(--accent)"
      badge="for you"
    >
      <div className="space-y-2.5">
        <div className="text-[14px] font-semibold leading-snug">
          {payload?.headline ?? `We're building: ${fallbackTitle}`}
        </div>
        {payload?.currentlyDoing && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-0.5">
              Right now
            </div>
            <p className="text-[12.5px] leading-snug">
              {payload.currentlyDoing}
            </p>
          </div>
        )}
        {payload?.whatsNext && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-0.5">
              What&apos;s next
            </div>
            <p className="text-[12.5px] leading-snug">{payload.whatsNext}</p>
          </div>
        )}
        {payload?.tryIt && (
          <div className="border-t border-[var(--border)] pt-2 mt-1">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mb-0.5">
              Try it
            </div>
            <p className="text-[12.5px] leading-snug text-[var(--accent)]">
              {payload.tryIt}
            </p>
          </div>
        )}
        {!payload && (
          <p className="text-[11.5px] text-[var(--muted)] italic">
            The team will post updates here as work progresses. Drop your
            feedback below.
          </p>
        )}
      </div>
    </Tile>
  );
}
