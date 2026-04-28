import { db, schema } from "@/db/client";
import { embedDocument } from "./embed";
import { eq, sql } from "drizzle-orm";

export async function embedMessageBody(messageId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const vec = await embedDocument(trimmed);
  const literal = `[${vec.join(",")}]`;
  await db
    .update(schema.messages)
    .set({ embedding: sql`${literal}::vector` })
    .where(eq(schema.messages.id, messageId));
}

export function embedMessageBodyFireAndForget(messageId: string, body: string) {
  embedMessageBody(messageId, body).catch((err) => {
    console.warn(
      `[embed] message ${messageId} failed:`,
      err instanceof Error ? err.message : err,
    );
  });
}
