import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { anthropic, MODEL, loadPromptByName } from "./anthropic";
import { loadContainerMessages } from "@/lib/containerMessages";
import { embedMessageBodyFireAndForget } from "@/lib/embedMessage";

export type SocraticEvent =
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string } };

export type SocraticEmit = (e: SocraticEvent) => void;

const MAX_TOKENS = 700;

function toAnthropicMessages(
  rows: Awaited<ReturnType<typeof loadContainerMessages>>,
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  for (const row of rows) {
    if (!row.bodyMd?.trim()) continue;
    const role: "user" | "assistant" =
      row.authorKind === "agent" && row.agentRole === "socratic"
        ? "assistant"
        : "user";
    const prefix =
      role === "user" && row.authorKind === "user"
        ? `[${row.authorLabel}] `
        : "";
    out.push({ role, content: `${prefix}${row.bodyMd}` });
  }
  while (out.length && out[out.length - 1].role === "assistant") out.pop();
  return out;
}

export async function runSocratic(opts: {
  discussionId: string;
  emit: SocraticEmit;
}) {
  const { discussionId, emit } = opts;
  const a = anthropic();
  const system = await loadPromptByName("socratic");

  const rows = await loadContainerMessages("discussion", discussionId);
  const messages = toAnthropicMessages(rows);

  if (messages.length === 0) {
    emit({ event: "error", data: { message: "no user messages" } });
    return null;
  }

  const [agentMsg] = await db
    .insert(schema.messages)
    .values({
      threadKind: "discussion",
      containerId: discussionId,
      authorKind: "agent",
      authorPersona: "agent",
      agentRole: "socratic",
      authorLabel: "Socratic agent",
      bodyMd: "",
      blocks: [],
    })
    .returning();

  let final = "";
  try {
    const stream = a.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    for await (const evt of stream) {
      if (
        evt.type === "content_block_delta" &&
        evt.delta.type === "text_delta"
      ) {
        final += evt.delta.text;
        emit({ event: "token", data: { text: evt.delta.text } });
      }
    }
    await stream.finalMessage();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ event: "error", data: { message: msg } });
    await db
      .delete(schema.messages)
      .where(eq(schema.messages.id, agentMsg.id));
    return null;
  }

  await db
    .update(schema.messages)
    .set({ bodyMd: final })
    .where(eq(schema.messages.id, agentMsg.id));

  await db
    .update(schema.discussions)
    .set({ updatedAt: new Date() })
    .where(eq(schema.discussions.id, discussionId));

  if (final.trim()) {
    embedMessageBodyFireAndForget(agentMsg.id, final);
  } else {
    await db
      .delete(schema.messages)
      .where(eq(schema.messages.id, agentMsg.id));
  }

  emit({ event: "done", data: { messageId: agentMsg.id } });
  return agentMsg.id;
}
