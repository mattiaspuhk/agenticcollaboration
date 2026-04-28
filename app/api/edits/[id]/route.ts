import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export async function GET(
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
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, edit.taskId),
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: edit.id,
    taskId: edit.taskId,
    status: edit.status,
    diff: edit.diff,
    task: { externalId: task.externalId, title: task.title },
  });
}
