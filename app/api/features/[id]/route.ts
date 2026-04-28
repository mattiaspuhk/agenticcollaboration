import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const role = (req.nextUrl.searchParams.get("role") ?? "pm") as
    | "pm"
    | "eng"
    | "user";

  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, id),
  });
  if (!feature) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const messages = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.threadKind, "feature"),
      eq(schema.messages.containerId, id),
    ),
    orderBy: [asc(schema.messages.createdAt)],
  });

  const decisions = await db.query.decisions.findMany({
    where: eq(schema.decisions.featureId, id),
    orderBy: [desc(schema.decisions.createdAt)],
  });

  const signals = await db.query.featureSignals.findMany({
    where: and(
      eq(schema.featureSignals.featureId, id),
      inArray(schema.featureSignals.role, [role, "all"]),
    ),
  });

  const tiles: Record<string, { payload: unknown; generatedAt: string }> = {};
  for (const s of signals) {
    tiles[s.tileKind] = {
      payload: s.payload,
      generatedAt: s.generatedAt.toISOString(),
    };
  }

  return NextResponse.json({
    feature: {
      id: feature.id,
      projectId: feature.projectId,
      slug: feature.slug,
      title: feature.title,
      description: feature.description,
      status: feature.status,
      statusNote: feature.statusNote,
      branchName: feature.branchName,
      githubRepo: feature.githubRepo,
      blockers: feature.blockers,
      linkedPrIds: feature.linkedPrIds,
      sourceDiscussionId: feature.sourceDiscussionId,
      discoveryDigest: feature.discoveryDigest,
      lastAgentSummaryAt:
        feature.lastAgentSummaryAt?.toISOString() ?? null,
      lastGithubPollAt: feature.lastGithubPollAt?.toISOString() ?? null,
      createdAt: feature.createdAt.toISOString(),
      updatedAt: feature.updatedAt.toISOString(),
    },
    role,
    tiles,
    decisions: decisions.map((d) => ({
      id: d.id,
      body: d.body,
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind,
      authorPersona: m.authorPersona,
      authorLabel: m.authorLabel,
      agentRole: m.agentRole,
      bodyMd: m.bodyMd,
      blocks: m.blocks,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const Patch = z.object({
  branchName: z.string().max(200).nullable().optional(),
  githubRepo: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/repo")
    .nullable()
    .optional(),
  status: z
    .enum(["scoping", "in_progress", "blocked", "in_review", "shipped"])
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const updates: Partial<typeof schema.features.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.branchName !== undefined)
    updates.branchName = parsed.data.branchName ?? null;
  if (parsed.data.githubRepo !== undefined)
    updates.githubRepo = parsed.data.githubRepo ?? null;
  if (parsed.data.status) updates.status = parsed.data.status;
  await db
    .update(schema.features)
    .set(updates)
    .where(eq(schema.features.id, id));
  return NextResponse.json({ ok: true });
}
