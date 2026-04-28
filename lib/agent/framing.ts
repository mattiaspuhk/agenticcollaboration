import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  anthropic,
  MODEL,
  loadPromptByName,
  extractText,
  tryParseJson,
} from "./anthropic";
import { loadContainerMessages } from "@/lib/containerMessages";
import type { FramingCriteria, FramingState } from "@/db/schema";

const EMPTY_CRITERIA: FramingCriteria = {
  specificUser: false,
  specificWorkflow: false,
  expectationGap: false,
  concreteSignal: false,
  falsifiable: false,
};

export async function detectFraming(discussionId: string): Promise<FramingState> {
  const a = anthropic();
  const system = await loadPromptByName("framing-detector");

  const rows = await loadContainerMessages("discussion", discussionId);
  if (rows.length < 2) {
    const state: FramingState = {
      converged: false,
      criteria: EMPTY_CRITERIA,
      reason: "thread too short",
      checkedAt: new Date().toISOString(),
    };
    await persistFraming(discussionId, state);
    return state;
  }

  const transcript = rows
    .filter((r) => r.bodyMd?.trim())
    .map((r) => {
      const who =
        r.authorKind === "agent"
          ? `Socratic agent`
          : r.authorLabel || r.authorPersona;
      return `${who}: ${r.bodyMd.trim()}`;
    })
    .join("\n\n");

  const userTurn: Anthropic.Messages.MessageParam = {
    role: "user",
    content: `Transcript of the discovery thread so far:\n\n${transcript}\n\nRespond with the JSON object only.`,
  };

  let raw = "";
  try {
    const msg = await a.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [userTurn],
    });
    raw = extractText(msg);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const state: FramingState = {
      converged: false,
      criteria: EMPTY_CRITERIA,
      reason: `framing error: ${reason}`,
      checkedAt: new Date().toISOString(),
    };
    await persistFraming(discussionId, state);
    return state;
  }

  const parsed = tryParseJson<{
    criteria?: Partial<FramingCriteria>;
    converged: boolean;
    suggestedTitle: string | null;
    reason: string;
  }>(raw);

  const criteria: FramingCriteria = parsed?.criteria
    ? {
        specificUser: !!parsed.criteria.specificUser,
        specificWorkflow: !!parsed.criteria.specificWorkflow,
        expectationGap: !!parsed.criteria.expectationGap,
        concreteSignal: !!parsed.criteria.concreteSignal,
        falsifiable: !!parsed.criteria.falsifiable,
      }
    : EMPTY_CRITERIA;

  const allTrue =
    criteria.specificUser &&
    criteria.specificWorkflow &&
    criteria.expectationGap &&
    criteria.concreteSignal &&
    criteria.falsifiable;

  const state: FramingState = parsed
    ? {
        // The model claims `converged` only if it also believes Socratic
        // hasn't pushed back hard. Gate it on all-five being true as a safety.
        converged: !!parsed.converged && allTrue,
        criteria,
        suggestedTitle: parsed.suggestedTitle ?? undefined,
        reason: parsed.reason ?? "",
        checkedAt: new Date().toISOString(),
      }
    : {
        converged: false,
        criteria: EMPTY_CRITERIA,
        reason: "framing parse failed",
        checkedAt: new Date().toISOString(),
      };

  await persistFraming(discussionId, state);
  return state;
}

async function persistFraming(discussionId: string, state: FramingState) {
  await db
    .update(schema.discussions)
    .set({ framingState: state, updatedAt: new Date() })
    .where(eq(schema.discussions.id, discussionId));
}
