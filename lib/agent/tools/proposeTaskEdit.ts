import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";
import type { ProposedEditDiff } from "@/db/schema";

export const proposeTaskEdit: ToolHandler = async (args, ctx) => {
  const externalId = String(args.external_id ?? "");
  const rationale = String(args.rationale ?? "");
  const rawChanges = (args.changes ?? []) as Array<{
    field: string;
    new_value: unknown;
  }>;
  const attachedQuote = args.attached_quote
    ? String(args.attached_quote)
    : undefined;

  if (!externalId || !rationale || rawChanges.length === 0) {
    return {
      text: "propose_task_edit: external_id, rationale, and at least one change are required",
    };
  }

  const task = await db.query.tasks.findFirst({
    where: and(
      eq(schema.tasks.projectId, ctx.projectId),
      eq(schema.tasks.externalId, externalId),
    ),
  });
  if (!task) return { text: `No task with external_id ${externalId}` };

  const allowedFields = new Set([
    "title",
    "description",
    "acceptance_criteria",
    "file_refs",
  ]);

  const changes: ProposedEditDiff["changes"] = [];
  for (const c of rawChanges) {
    if (!allowedFields.has(c.field)) continue;
    let oldValue: unknown;
    switch (c.field) {
      case "title":
        oldValue = task.title;
        break;
      case "description":
        oldValue = task.description;
        break;
      case "acceptance_criteria":
        oldValue = task.acceptanceCriteria;
        break;
      case "file_refs":
        oldValue = task.fileRefs;
        break;
    }
    changes.push({
      field: c.field as ProposedEditDiff["changes"][number]["field"],
      oldValue,
      newValue: c.new_value,
    });
  }

  if (changes.length === 0) {
    return { text: "propose_task_edit: no valid fields in changes" };
  }

  const diff: ProposedEditDiff = { rationale, changes, attachedQuote };

  const [edit] = await db
    .insert(schema.proposedEdits)
    .values({
      taskId: task.id,
      messageId: ctx.agentMessageId,
      diff,
    })
    .returning();

  return {
    text: `Proposed edit ${edit.id} created for task ${externalId}. The team will see an approve/reject card in the thread.`,
    blocks: [{ type: "edit_card", editId: edit.id }],
  };
};
