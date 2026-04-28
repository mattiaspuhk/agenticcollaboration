import { db, schema } from "@/db/client";
import { and, asc, eq, desc } from "drizzle-orm";
import {
  anthropic,
  MODEL,
  loadPromptByName,
  extractText,
  tryParseJson,
} from "./anthropic";
import type { LinkedPr, FeatureBlocker } from "@/db/schema";

export type Role = "pm" | "eng" | "user";
const ROLES: Role[] = ["pm", "eng", "user"];

const inFlight = new Map<string, Promise<void>>();

export function runSummarizer(featureId: string): Promise<void> {
  const existing = inFlight.get(featureId);
  if (existing) return existing;
  const p = (async () => {
    try {
      await summarizeFeature(featureId);
    } catch (err) {
      console.warn(`[summarizer] feature ${featureId} failed:`, err);
    } finally {
      inFlight.delete(featureId);
    }
  })();
  inFlight.set(featureId, p);
  return p;
}

async function summarizeFeature(featureId: string): Promise<void> {
  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, featureId),
  });
  if (!feature) return;

  const messages = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.threadKind, "feature"),
      eq(schema.messages.containerId, featureId),
    ),
    orderBy: [asc(schema.messages.createdAt)],
  });

  const recent = messages.slice(-25);
  const decisions = await db.query.decisions.findMany({
    where: eq(schema.decisions.featureId, featureId),
    orderBy: [desc(schema.decisions.createdAt)],
    limit: 10,
  });

  const feedbackMessages = recent.filter(
    (m) => m.authorPersona === "user",
  );

  const a = anthropic();

  const featureContext = renderFeatureContext({
    feature,
    decisions,
    transcript: recent
      .map((m) => `${m.authorLabel || m.authorPersona}: ${m.bodyMd}`)
      .join("\n\n"),
    feedback: feedbackMessages
      .map((m) => `${m.authorLabel}: ${m.bodyMd}`)
      .join("\n\n"),
  });

  for (const role of ROLES) {
    const promptName = `summarizer-${role}`;
    const system = await loadPromptByName(promptName);
    let raw = "";
    try {
      const msg = await a.messages.create({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: featureContext }],
      });
      raw = extractText(msg);
    } catch (err) {
      console.warn(`[summarizer] role=${role} call failed:`, err);
      continue;
    }
    const parsed = tryParseJson<Record<string, unknown>>(raw);
    if (!parsed) continue;

    await writeSignals(featureId, role, parsed);
  }

  await db
    .update(schema.features)
    .set({ lastAgentSummaryAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.features.id, featureId));
}

async function writeSignals(
  featureId: string,
  role: Role,
  parsed: Record<string, unknown>,
) {
  const ops: Promise<unknown>[] = [];
  const tileMap: Record<Role, Record<string, string>> = {
    pm: { status: "StatusTile", chat: "ChatTile", feedback: "FeedbackTile" },
    eng: { status: "StatusTile", chat: "ChatTile", feedback: "FeedbackTile" },
    user: {
      featureCard: "FeatureCardTile",
      chat: "ChatTile",
      feedback: "FeedbackTile",
    },
  };
  const map = tileMap[role];
  for (const [key, tileKind] of Object.entries(map)) {
    const payload = parsed[key];
    if (!payload || typeof payload !== "object") continue;
    ops.push(upsertSignal(featureId, role, tileKind, payload as Record<string, unknown>));
  }
  await Promise.all(ops);
}

async function upsertSignal(
  featureId: string,
  role: Role,
  tileKind: string,
  payload: Record<string, unknown>,
) {
  await db
    .delete(schema.featureSignals)
    .where(
      and(
        eq(schema.featureSignals.featureId, featureId),
        eq(schema.featureSignals.role, role),
        eq(schema.featureSignals.tileKind, tileKind),
      ),
    );
  await db.insert(schema.featureSignals).values({
    featureId,
    role,
    tileKind,
    payload,
    generatedAt: new Date(),
  });
}

function renderFeatureContext(opts: {
  feature: typeof schema.features.$inferSelect;
  decisions: (typeof schema.decisions.$inferSelect)[];
  transcript: string;
  feedback: string;
}) {
  const { feature, decisions, transcript, feedback } = opts;
  const digest = feature.discoveryDigest;
  const blockers = (feature.blockers as FeatureBlocker[]) ?? [];
  const prs = (feature.linkedPrIds as LinkedPr[]) ?? [];

  return [
    `# Feature\n` +
      `Title: ${feature.title}\n` +
      `Slug: ${feature.slug}\n` +
      `Status: ${feature.status}${
        feature.statusNote ? ` — ${feature.statusNote}` : ""
      }\n` +
      `GitHub repo: ${feature.githubRepo ?? "—"}\n` +
      `Branch: ${feature.branchName ?? "—"}`,

    digest
      ? `# Discovery digest\n` +
        `Framed problem: ${digest.framedProblem}\n` +
        (digest.keyContext.length
          ? `Key context:\n- ${digest.keyContext.join("\n- ")}\n`
          : "") +
        (digest.sourceQuotes.length
          ? `Source quotes:\n- ${digest.sourceQuotes
              .map((q) => `"${q}"`)
              .join("\n- ")}`
          : "")
      : `# Discovery digest\n(none)`,

    blockers.length
      ? `# Blockers\n- ${blockers.map((b) => b.body).join("\n- ")}`
      : `# Blockers\n(none)`,

    prs.length
      ? `# Linked PRs\n${prs
          .map(
            (pr) =>
              `#${pr.number} (${pr.state}) ${pr.title} — ${pr.url}`,
          )
          .join("\n")}`
      : `# Linked PRs\n(none)`,

    decisions.length
      ? `# Decisions\n${decisions
          .map(
            (d) =>
              `- ${d.body}${d.resolvedAt ? ` (resolved)` : " (open)"}`,
          )
          .join("\n")}`
      : `# Decisions\n(none)`,

    `# Recent messages\n${transcript || "(no messages yet)"}`,

    feedback
      ? `# User-posted messages\n${feedback}`
      : `# User-posted messages\n(none)`,

    `\nReturn the JSON object now. No prose, no markdown fence.`,
  ].join("\n\n");
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleSummarizer(featureId: string, delayMs = 5000): void {
  const existing = debounceTimers.get(featureId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    debounceTimers.delete(featureId);
    runSummarizer(featureId);
  }, delayMs);
  debounceTimers.set(featureId, t);
}

