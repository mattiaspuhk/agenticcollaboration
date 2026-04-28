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
import type { DiscoveryDigest } from "@/db/schema";

type DistilledPayload = {
  framedProblem: string;
  keyContext: string[];
  sourceQuotes: string[];
  suggestedTitle: string;
  suggestedSlug: string;
};

function safeSlug(s: string, fallback: string): string {
  const cleaned = (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

export async function graduateDiscussion(opts: {
  discussionId: string;
  projectId: string;
}): Promise<{ featureId: string; slug: string }> {
  const { discussionId, projectId } = opts;

  const discussion = await db.query.discussions.findFirst({
    where: eq(schema.discussions.id, discussionId),
  });
  if (!discussion) throw new Error("discussion not found");
  if (discussion.state !== "open") {
    if (discussion.state === "graduated" && discussion.graduatedToFeatureId) {
      const existing = await db.query.features.findFirst({
        where: eq(schema.features.id, discussion.graduatedToFeatureId),
      });
      if (existing) return { featureId: existing.id, slug: existing.slug };
    }
    throw new Error(`discussion is ${discussion.state}, cannot graduate`);
  }

  const a = anthropic();
  const system = await loadPromptByName("graduation-distiller");
  const rows = await loadContainerMessages("discussion", discussionId);
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
    content: `Discussion thread to distill:\n\n${transcript}\n\nReturn the JSON now.`,
  };

  let payload: DistilledPayload | null = null;
  try {
    const msg = await a.messages.create({
      model: MODEL,
      max_tokens: 900,
      system,
      messages: [userTurn],
    });
    payload = tryParseJson<DistilledPayload>(extractText(msg));
  } catch (err) {
    console.warn("[distiller] anthropic call failed:", err);
  }

  const fallbackTitle = discussion.framingState?.suggestedTitle ?? discussion.title;
  const title = payload?.suggestedTitle?.trim() || fallbackTitle;
  const slugBase =
    payload?.suggestedSlug?.trim() ||
    discussion.framingState?.suggestedTitle ||
    title;
  const slug = await uniqueSlug(projectId, safeSlug(slugBase, "feature"));

  const digest: DiscoveryDigest = {
    framedProblem:
      payload?.framedProblem?.trim() ||
      discussion.framingState?.reason ||
      title,
    keyContext: (payload?.keyContext ?? []).filter(Boolean).slice(0, 4),
    sourceQuotes: (payload?.sourceQuotes ?? []).filter(Boolean).slice(0, 3),
  };

  const [feature] = await db
    .insert(schema.features)
    .values({
      projectId,
      slug,
      title,
      description: digest.framedProblem,
      sourceDiscussionId: discussionId,
      discoveryDigest: digest,
    })
    .returning();

  await db
    .update(schema.discussions)
    .set({
      state: "graduated",
      graduatedToFeatureId: feature.id,
      graduatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.discussions.id, discussionId));

  await db.insert(schema.messages).values({
    threadKind: "feature",
    containerId: feature.id,
    authorKind: "system",
    authorPersona: "system",
    authorLabel: "System",
    bodyMd: `Graduated from discovery thread. Discovery digest pinned at the top.`,
    blocks: [],
  });

  return { featureId: feature.id, slug };
}

async function uniqueSlug(projectId: string, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await db.query.features.findFirst({
      where: (f, { and, eq }) =>
        and(eq(f.projectId, projectId), eq(f.slug, candidate)),
    });
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}
