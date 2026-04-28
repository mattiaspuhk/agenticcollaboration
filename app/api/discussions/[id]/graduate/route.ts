import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { graduateDiscussion } from "@/lib/agent/distiller";
import { runSummarizer } from "@/lib/agent/summarizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  try {
    const result = await graduateDiscussion({
      discussionId: id,
      projectId: discussion.projectId,
    });
    runSummarizer(result.featureId).catch((err) => {
      console.warn("[graduate] post-graduation summarizer failed:", err);
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
