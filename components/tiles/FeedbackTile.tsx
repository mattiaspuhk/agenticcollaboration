import { Tile } from "./Tile";
import type { TileVisual, FeedbackTilePayload } from "@/lib/tiles";
import type { MessageView } from "../Message";

export function FeedbackTile({
  payload,
  visual,
  userMessages,
  role,
}: {
  payload: FeedbackTilePayload | null;
  visual: TileVisual;
  userMessages: MessageView[];
  role: "pm" | "eng" | "user";
}) {
  const title = role === "user" ? "Your input" : "User feedback";
  const summary =
    payload?.summary ??
    (userMessages.length === 0
      ? "No user feedback yet."
      : `${userMessages.length} feedback message${
          userMessages.length === 1 ? "" : "s"
        } posted.`);

  return (
    <Tile title={title} visual={visual} accent="var(--design)">
      <p className="text-[12.5px] leading-snug whitespace-pre-wrap">
        {summary}
      </p>
      {payload?.themes && payload.themes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {payload.themes.map((t, i) => (
            <span
              key={i}
              className="text-[10px] text-[var(--design)] border rounded-full px-1.5 py-px"
              style={{
                borderColor:
                  "color-mix(in srgb,var(--design) 35%,transparent)",
                background:
                  "color-mix(in srgb,var(--design) 10%,transparent)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {role !== "user" && userMessages.length > 0 && (
        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
          {userMessages.slice(-4).map((m) => (
            <div
              key={m.id}
              className="text-[11.5px] border-l-2 border-[var(--border-strong)] pl-2 italic text-[var(--foreground)]/85"
            >
              <div className="text-[10px] text-[var(--muted)] mb-0.5 not-italic font-medium">
                {m.authorLabel}
              </div>
              {m.bodyMd}
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}
