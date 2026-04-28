import { db, schema } from "@/db/client";
import { and, ne, eq, asc } from "drizzle-orm";
import type { ToolHandler } from "./index";

export const listActiveTasks: ToolHandler = async (_args, ctx) => {
  const rows = await db
    .select({
      externalId: schema.tasks.externalId,
      title: schema.tasks.title,
      status: schema.tasks.status,
      assignee: schema.tasks.assignee,
      description: schema.tasks.description,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, ctx.projectId),
        ne(schema.tasks.status, "done"),
      ),
    )
    .orderBy(asc(schema.tasks.externalId));

  if (rows.length === 0) return { text: "No active tasks." };

  const text = rows
    .map((r) => {
      const desc = r.description.length > 120 ? r.description.slice(0, 120) + "…" : r.description;
      return `${r.externalId} [${r.status}] ${r.title}${r.assignee ? ` · @${r.assignee}` : ""}\n  ${desc}`;
    })
    .join("\n");

  return { text };
};
