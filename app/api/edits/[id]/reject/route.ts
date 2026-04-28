import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const edit = await db.query.proposedEdits.findFirst({
    where: eq(schema.proposedEdits.id, id),
  });
  if (!edit) {
    return NextResponse.json({ error: "Edit not found" }, { status: 404 });
  }
  if (edit.status !== "pending") {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  await db
    .update(schema.proposedEdits)
    .set({ status: "rejected", decidedAt: new Date(), decidedBy: "human" })
    .where(eq(schema.proposedEdits.id, id));

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, edit.taskId),
  });

  return NextResponse.json({
    id: edit.id,
    taskId: edit.taskId,
    status: "rejected",
    diff: edit.diff,
    task: task ? { externalId: task.externalId, title: task.title } : null,
  });
}
