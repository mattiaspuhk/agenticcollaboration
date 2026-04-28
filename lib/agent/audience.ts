import { loadPromptByName } from "./anthropic";
import type { PersonaId } from "@/lib/personas";

export type AudienceMode = "pm" | "engineer" | "designer";

const OVERLAY_PROMPT: Record<AudienceMode, string> = {
  pm: "audience-pm",
  engineer: "audience-engineer",
  designer: "audience-designer",
};

export function detectAudienceMode(
  rows: { authorKind: string; authorPersona: string }[],
): AudienceMode | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.authorKind !== "user") continue;
    const p = r.authorPersona as PersonaId;
    if (p === "pm" || p === "engineer" || p === "designer") return p;
    return null;
  }
  return null;
}

export async function loadAudienceOverlay(
  mode: AudienceMode | null,
): Promise<string | null> {
  if (!mode) return null;
  return loadPromptByName(OVERLAY_PROMPT[mode]);
}
