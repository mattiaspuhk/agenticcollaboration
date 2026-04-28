import { db, schema } from "@/db/client";
import { and, asc, eq } from "drizzle-orm";

export type ThreadKind = "discussion" | "feature";

export async function loadContainerMessages(
  threadKind: ThreadKind,
  containerId: string,
) {
  return db.query.messages.findMany({
    where: and(
      eq(schema.messages.threadKind, threadKind),
      eq(schema.messages.containerId, containerId),
    ),
    orderBy: [asc(schema.messages.createdAt)],
  });
}
