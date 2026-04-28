import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const discussion = await db.query.discussions.findFirst({
    where: eq(schema.discussions.id, id),
  });
  if (!discussion) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const messages = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.threadKind, "discussion"),
      eq(schema.messages.containerId, id),
    ),
    orderBy: [asc(schema.messages.createdAt)],
  });
  return NextResponse.json({
    discussion: {
      id: discussion.id,
      projectId: discussion.projectId,
      title: discussion.title,
      state: discussion.state,
      framingState: discussion.framingState,
      graduatedToFeatureId: discussion.graduatedToFeatureId,
      createdAt: discussion.createdAt.toISOString(),
      updatedAt: discussion.updatedAt.toISOString(),
    },
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
