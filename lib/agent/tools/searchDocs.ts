import { db, schema } from "@/db/client";
import { embedQuery } from "@/lib/embed";
import { sql, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";

export const searchDocs: ToolHandler = async (args, ctx) => {
  const query = String(args.query ?? "");
  const limit = Math.min(Number(args.limit ?? 5), 8);
  if (!query) return { text: "search_docs: missing query" };

  const vec = await embedQuery(query);
  const literal = `[${vec.join(",")}]`;

  const rows = await db
    .select({
      filePath: schema.docChunks.filePath,
      section: schema.docChunks.section,
      content: schema.docChunks.content,
    })
    .from(schema.docChunks)
    .where(eq(schema.docChunks.projectId, ctx.projectId))
    .orderBy(sql`embedding <=> ${literal}::vector`)
    .limit(limit);

  if (rows.length === 0) return { text: "No doc matches found." };

  const text = rows
    .map((r) => {
      const snippet = r.content.length > 400 ? r.content.slice(0, 400) + "…" : r.content;
      return `${r.filePath} · ${r.section}\n${snippet}`;
    })
    .join("\n\n---\n\n");

  return { text };
};
