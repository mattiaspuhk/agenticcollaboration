import { db, schema } from "@/db/client";
import { embedQuery } from "@/lib/embed";
import { sql, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";

export const searchCodebase: ToolHandler = async (args, ctx) => {
  const query = String(args.query ?? "");
  const limit = Math.min(Number(args.limit ?? 6), 10);
  if (!query) return { text: "search_codebase: missing query" };

  const vec = await embedQuery(query);
  const literal = `[${vec.join(",")}]`;

  const rows = await db
    .select({
      id: schema.codeChunks.id,
      filePath: schema.codeChunks.filePath,
      lineStart: schema.codeChunks.lineStart,
      lineEnd: schema.codeChunks.lineEnd,
      content: schema.codeChunks.content,
      distance: sql<number>`embedding <=> ${literal}::vector`,
    })
    .from(schema.codeChunks)
    .where(eq(schema.codeChunks.projectId, ctx.projectId))
    .orderBy(sql`embedding <=> ${literal}::vector`)
    .limit(limit);

  if (rows.length === 0) {
    return { text: "No code matches found." };
  }

  const text = rows
    .map((r) => {
      const snippet = r.content.length > 400 ? r.content.slice(0, 400) + "…" : r.content;
      return `${r.filePath}:${r.lineStart}-${r.lineEnd}\n${snippet}`;
    })
    .join("\n\n---\n\n");

  return { text };
};
