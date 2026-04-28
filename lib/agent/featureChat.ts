import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { anthropic, MODEL, loadPromptByName } from "./anthropic";
import { loadContainerMessages } from "@/lib/containerMessages";
import { embedMessageBodyFireAndForget } from "@/lib/embedMessage";
import type { LinkedPr, FeatureBlocker } from "@/db/schema";

export type FeatureChatEvent =
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string } };

export type FeatureChatEmit = (e: FeatureChatEvent) => void;

const MAX_TOKENS = 700;

function toAnthropicMessages(
  rows: Awaited<ReturnType<typeof loadContainerMessages>>,
): Anthropic.Messages.MessageParam[] {
  const out: Anthropic.Messages.MessageParam[] = [];
  for (const row of rows) {
    if (!row.bodyMd?.trim()) continue;
    const isAgentChat =
      row.authorKind === "agent" && row.agentRole === "feature-chat";
    const role: "user" | "assistant" = isAgentChat ? "assistant" : "user";
    const prefix =
      role === "user" ? `[${row.authorLabel || row.authorPersona}] ` : "";
    out.push({ role, content: `${prefix}${row.bodyMd}` });
  }
  while (out.length && out[out.length - 1].role === "assistant") out.pop();
  return out;
}

function renderFeatureContext(
  feature: typeof schema.features.$inferSelect,
): string {
  const digest = feature.discoveryDigest;
  const blockers = (feature.blockers as FeatureBlocker[]) ?? [];
  const prs = (feature.linkedPrIds as LinkedPr[]) ?? [];

  const parts: string[] = [];
  parts.push(
    `## Feature record\nTitle: ${feature.title}\nSlug: ${feature.slug}\nStatus: ${feature.status}${feature.statusNote ? ` — ${feature.statusNote}` : ""}\nBranch: ${feature.branchName ?? "(none)"}\nGitHub: ${feature.githubRepo ?? "(none)"}`,
  );
  if (digest) {
    parts.push(
      `## Discovery digest (pinned)\nFramed problem: ${digest.framedProblem}` +
        (digest.keyContext.length
          ? `\nKey context:\n- ${digest.keyContext.join("\n- ")}`
          : "") +
        (digest.sourceQuotes.length
          ? `\nSource quotes:\n- ${digest.sourceQuotes.map((q) => `"${q}"`).join("\n- ")}`
          : ""),
    );
  }
  if (blockers.length) {
    parts.push(
      `## Blockers\n- ${blockers.map((b) => b.body).join("\n- ")}`,
    );
  }
  if (prs.length) {
    parts.push(
      `## Linked PRs\n${prs.map((pr) => `#${pr.number} (${pr.state}) ${pr.title}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export async function runFeatureChat(opts: {
  featureId: string;
  emit: FeatureChatEmit;
}) {
  const { featureId, emit } = opts;
  const a = anthropic();
  const baseSystem = await loadPromptByName("feature-chat");

  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, featureId),
  });
  if (!feature) {
    emit({ event: "error", data: { message: "feature not found" } });
    return null;
  }

  const rows = await loadContainerMessages("feature", featureId);
  const messages = toAnthropicMessages(rows);

  if (messages.length === 0) {
    emit({ event: "error", data: { message: "no user messages" } });
    return null;
  }

  const featureContext = renderFeatureContext(feature);
  const system = `${baseSystem}\n\n# Feature context\n\n${featureContext}`;

  const [agentMsg] = await db
    .insert(schema.messages)
    .values({
      threadKind: "feature",
      containerId: featureId,
      authorKind: "agent",
      authorPersona: "agent",
      agentRole: "feature-chat",
      authorLabel: "Agent",
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
    .update(schema.features)
    .set({ updatedAt: new Date() })
    .where(eq(schema.features.id, featureId));

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
