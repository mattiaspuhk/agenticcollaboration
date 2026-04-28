import { Tile } from "./Tile";
import type { TileVisual, StatusTilePayload } from "@/lib/tiles";

const TONE_COLOR: Record<StatusTilePayload["tone"], string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
};

export function StatusTile({
  payload,
  visual,
  status,
  statusNote,
  generatedAt,
}: {
  payload: StatusTilePayload | null;
  visual: TileVisual;
  status: string;
  statusNote: string;
  generatedAt: string | null;
}) {
  const headline =
    payload?.headline ??
    (statusNote
      ? `${prettyStatus(status)} — ${statusNote}`
      : prettyStatus(status));
  const tone = payload?.tone ?? toneForStatus(status);
  const lastUpdate = payload?.lastUpdate ?? "Awaiting first agent summary.";
  const accent = TONE_COLOR[tone];

  return (
    <Tile title="Status" visual={visual} accent={accent} badge={tone}>
      <div className="flex items-start gap-2">
        <span
          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
          style={{ background: accent }}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-snug">
            {headline}
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-1">
            {lastUpdate}
          </div>
          {generatedAt && (
            <div className="text-[10px] text-[var(--muted-2)] mt-1">
              summary {timeAgo(generatedAt)}
            </div>
          )}
        </div>
      </div>
    </Tile>
  );
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function toneForStatus(s: string): StatusTilePayload["tone"] {
  if (s === "blocked") return "err";
  if (s === "in_review" || s === "scoping") return "warn";
  return "ok";
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  if (diff < 60_000) return "moments ago";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
