import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { runAgent } from "@/lib/agent/run";

export const runtime = "nodejs";

// Server-triggered second agent run after a proposed edit is approved.
// Posts a non-blocking heatmap message to the thread if signals threshold is met.
export async function POST(req: NextRequest) {
  const { editId } = await req.json();
  if (!editId) {
    return NextResponse.json({ error: "editId required" }, { status: 400 });
  }

  const edit = await db.query.proposedEdits.findFirst({
    where: eq(schema.proposedEdits.id, editId),
  });
  if (!edit || edit.status !== "approved" || !edit.messageId) {
    return NextResponse.json({ ok: false });
  }

  const triggerMsg = await db.query.messages.findFirst({
    where: eq(schema.messages.id, edit.messageId),
  });
  if (!triggerMsg || !triggerMsg.threadId)
    return NextResponse.json({ ok: false });

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, edit.taskId),
  });
  if (!task) return NextResponse.json({ ok: false });

  const extraSystem = `## Context for this turn

A task edit was just approved.
- Task: ${task.externalId} — ${task.title}
- Edit rationale: ${edit.diff.rationale}
- Affected files: ${task.fileRefs.join(", ") || "(none listed)"}

Run search_signals for the affected feature now. Decide whether to surface a pattern based on the threshold rule.`;

  // Fire-and-forget the agent. Drain emitted events to /dev/null — the UI
  // re-fetches the thread on its next poll/refresh and will pick up the new
  // message (if any).
  runAgent({
    threadId: triggerMsg.threadId,
    systemPromptName: "postedit-reflection",
    emit: () => {},
    extraSystem,
  }).catch((err) => {
    console.error("reflect run failed:", err);
  });

  return NextResponse.json({ ok: true });
}
