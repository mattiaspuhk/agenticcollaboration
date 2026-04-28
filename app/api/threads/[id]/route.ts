import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { asc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const thread = await db.query.threads.findFirst({
    where: eq(schema.threads.id, id),
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = await db.query.messages.findMany({
    where: eq(schema.messages.threadId, id),
    orderBy: [asc(schema.messages.createdAt)],
  });

  return NextResponse.json({
    thread: { id: thread.id, title: thread.title },
    messages: messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind,
      authorPersona: m.authorPersona,
      authorLabel: m.authorLabel,
      bodyMd: m.bodyMd,
      blocks: m.blocks,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
