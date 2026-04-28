import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { TOOL_DEFS, runTool } from "./tools";
import type { MessageBlock } from "@/db/schema";
import { PERSONAS, type PersonaId } from "@/lib/personas";
import { embedMessageBodyFireAndForget } from "@/lib/embedMessage";
import { formatProjectFacts } from "@/lib/ingest/projectFacts";
import fs from "node:fs/promises";
import path from "node:path";

const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 8;
const MAX_TOKENS = 2048;

type PromptName =
  | "system"
  | "postedit-reflection"
  | "audience-pm"
  | "audience-engineer"
  | "audience-designer";

const promptCache = new Map<PromptName, string>();

async function loadPrompt(name: PromptName) {
  const cached = promptCache.get(name);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "prompts", `${name}.md`);
  const content = await fs.readFile(filePath, "utf-8");
  promptCache.set(name, content);
  return content;
}

const AUDIENCE_OVERLAY: Partial<Record<PersonaId, PromptName>> = {
  pm: "audience-pm",
  engineer: "audience-engineer",
  designer: "audience-designer",
};

async function getAudienceOverlay(persona: PersonaId | null) {
  if (!persona) return null;
  const name = AUDIENCE_OVERLAY[persona];
  return name ? await loadPrompt(name) : null;
}

function detectAskingPersona(
  rows: Awaited<ReturnType<typeof loadThreadMessages>>,
): PersonaId | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.authorKind === "user") {
      return r.authorPersona as PersonaId;
    }
  }
  return null;
}

export type SSEEvent =
  | { event: "token"; data: { text: string } }
  | { event: "tool_call"; data: { name: string } }
  | { event: "tool_result"; data: { name: string; ok: boolean } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string } };

export type Emit = (e: SSEEvent) => void;

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

async function loadThreadMessages(threadId: string) {
  return db.query.messages.findMany({
    where: eq(schema.messages.threadId, threadId),
    orderBy: [asc(schema.messages.createdAt)],
  });
}

async function resolveProjectId(threadId: string): Promise<string> {
  const thread = await db.query.threads.findFirst({
    where: eq(schema.threads.id, threadId),
  });
  if (!thread) throw new Error(`Thread ${threadId} not found`);
  const channel = await db.query.channels.findFirst({
    where: eq(schema.channels.id, thread.channelId),
  });
  if (!channel) throw new Error(`Channel ${thread.channelId} not found`);
  return channel.projectId;
}

async function loadProjectFactsBlock(projectId: string): Promise<string | null> {
  const proj = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!proj?.facts) return null;
  return formatProjectFacts(proj.facts);
}

function toAnthropicMessages(
  rows: Awaited<ReturnType<typeof loadThreadMessages>>,
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  for (const row of rows) {
    const role = row.authorKind === "agent" ? "assistant" : "user";
    const prefix =
      row.authorKind === "user" ? `[${row.authorLabel}] ` : "";
    if (!row.bodyMd && (row.blocks?.length ?? 0) === 0) continue;
    out.push({
      role,
      content: `${prefix}${row.bodyMd}`,
    });
  }
  // Anthropic requires the last message to be a user turn for the next call.
  // If the last entry is assistant, drop it (rare path: agent posted with no user reply yet).
  while (out.length > 0 && out[out.length - 1].role === "assistant") {
    out.pop();
  }
  return out;
}

export async function runAgent(opts: {
  threadId: string;
  systemPromptName: "system" | "postedit-reflection";
  emit: Emit;
  extraSystem?: string;
}) {
  const { threadId, systemPromptName, emit } = opts;
  const a = client();
  const projectId = await resolveProjectId(threadId);

  // Persist a placeholder agent message to attach edits / final body to.
  const persona = PERSONAS.agent;
  const [agentMsg] = await db
    .insert(schema.messages)
    .values({
      threadId,
      authorKind: "agent",
      authorPersona: "agent",
      authorLabel: persona.label,
      bodyMd: "",
      blocks: [],
    })
    .returning();

  const collectedBlocks: MessageBlock[] = [];
  let finalText = "";

  const baseSystem = await loadPrompt(systemPromptName);

  const threadRows = await loadThreadMessages(threadId);
  const askingPersona = detectAskingPersona(
    threadRows.filter((r) => r.id !== agentMsg.id),
  );
  const overlay =
    systemPromptName === "system"
      ? await getAudienceOverlay(askingPersona)
      : null;

  const factsBlock = await loadProjectFactsBlock(projectId);

  const systemParts = [baseSystem];
  if (factsBlock) systemParts.push(factsBlock);
  if (overlay) systemParts.push(overlay);
  if (opts.extraSystem) systemParts.push(opts.extraSystem);
  const system = systemParts.join("\n\n");

  const messages = toAnthropicMessages(
    threadRows.filter((r) => r.id !== agentMsg.id),
  );

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let assistantText = "";
    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
    let stopReason: string | null = null;

    const stream = a.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      tools: TOOL_DEFS,
      messages,
    });

    for await (const evt of stream) {
      if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
        assistantText += evt.delta.text;
        emit({ event: "token", data: { text: evt.delta.text } });
      } else if (evt.type === "content_block_start" && evt.content_block.type === "tool_use") {
        emit({ event: "tool_call", data: { name: evt.content_block.name } });
      }
    }

    const finalMsg = await stream.finalMessage();
    stopReason = finalMsg.stop_reason;

    for (const block of finalMsg.content) {
      if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }

    if (stopReason === "tool_use" && toolUses.length > 0) {
      messages.push({ role: "assistant", content: finalMsg.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input, {
          threadId,
          projectId,
          agentMessageId: agentMsg.id,
        });
        if (result.blocks) collectedBlocks.push(...result.blocks);
        emit({ event: "tool_result", data: { name: tu.name, ok: true } });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: truncate(result.text, 4000),
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    finalText = assistantText;
    break;
  }

  await db
    .update(schema.messages)
    .set({ bodyMd: finalText, blocks: collectedBlocks })
    .where(eq(schema.messages.id, agentMsg.id));

  // If we have nothing to say AND no blocks, drop the placeholder.
  if (!finalText.trim() && collectedBlocks.length === 0) {
    await db.delete(schema.messages).where(eq(schema.messages.id, agentMsg.id));
  } else if (finalText.trim()) {
    embedMessageBodyFireAndForget(agentMsg.id, finalText);
  }

  emit({ event: "done", data: { messageId: agentMsg.id } });
  return agentMsg.id;
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…[truncated]";
}
