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

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, edit.taskId),
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const updates: Partial<typeof schema.tasks.$inferInsert> = {
    updatedAt: new Date(),
  };
  for (const change of edit.diff.changes) {
    switch (change.field) {
      case "title":
        updates.title = String(change.newValue ?? task.title);
        break;
      case "description":
        updates.description = String(change.newValue ?? task.description);
        break;
      case "acceptance_criteria":
        updates.acceptanceCriteria = Array.isArray(change.newValue)
          ? (change.newValue as string[])
          : task.acceptanceCriteria;
        break;
      case "file_refs":
        updates.fileRefs = Array.isArray(change.newValue)
          ? (change.newValue as string[])
          : task.fileRefs;
        break;
    }
  }

  await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, task.id));

  await db
    .update(schema.proposedEdits)
    .set({ status: "approved", decidedAt: new Date(), decidedBy: "human" })
    .where(eq(schema.proposedEdits.id, id));

  // Fire post-edit reflection (GOLD B). Non-blocking.
  const origin = new URL(_req.url).origin;
  fetch(`${origin}/api/agent/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editId: id }),
  }).catch(() => {});

  return NextResponse.json({
    id: edit.id,
    taskId: edit.taskId,
    status: "approved",
    diff: edit.diff,
    task: { externalId: task.externalId, title: updates.title ?? task.title },
  });
}
