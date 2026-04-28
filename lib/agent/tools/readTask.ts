import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";

export const readTask: ToolHandler = async (args, ctx) => {
  const externalId = String(args.external_id ?? "");
  if (!externalId) return { text: "read_task: missing external_id" };

  const t = await db.query.tasks.findFirst({
    where: and(
      eq(schema.tasks.projectId, ctx.projectId),
      eq(schema.tasks.externalId, externalId),
    ),
  });
  if (!t) return { text: `No task with external_id ${externalId}` };

  const lines = [
    `${t.externalId} [${t.status}] ${t.title}`,
    t.assignee ? `Assignee: @${t.assignee}` : "Unassigned",
    "",
    "Description:",
    t.description || "(empty)",
    "",
    "Acceptance criteria:",
    t.acceptanceCriteria.length === 0
      ? "  (none)"
      : t.acceptanceCriteria.map((c) => `  - ${c}`).join("\n"),
    "",
    "File refs:",
    t.fileRefs.length === 0 ? "  (none)" : t.fileRefs.map((f) => `  - ${f}`).join("\n"),
  ];
  return { text: lines.join("\n") };
};
