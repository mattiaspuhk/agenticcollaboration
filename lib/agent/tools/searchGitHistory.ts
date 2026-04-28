import { db, schema } from "@/db/client";
import { embedQuery } from "@/lib/embed";
import { sql, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";
import type { MessageBlock } from "@/db/schema";

export const searchGitHistory: ToolHandler = async (args, ctx) => {
  const query = String(args.query ?? "");
  const paths = Array.isArray(args.paths) ? (args.paths as string[]) : [];
  const limit = Math.min(Number(args.limit ?? 5), 8);
  if (!query) return { text: "search_git_history: missing query" };

  const vec = await embedQuery(query);
  const literal = `[${vec.join(",")}]`;

  const rows = await db
    .select({
      id: schema.commits.id,
      sha: schema.commits.sha,
      author: schema.commits.author,
      committedAt: schema.commits.committedAt,
      summary: schema.commits.summary,
      filePaths: schema.commits.filePaths,
      prNumber: schema.commits.prNumber,
    })
    .from(schema.commits)
    .where(eq(schema.commits.projectId, ctx.projectId))
    .orderBy(sql`embedding <=> ${literal}::vector`)
    .limit(limit * 3);

  const filtered = paths.length === 0
    ? rows
    : rows.filter((r) =>
        paths.some((p) => r.filePaths.some((fp) => fp.startsWith(p))),
      );

  const top = filtered.slice(0, limit);
  if (top.length === 0) return { text: "No commits matched." };

  const blocks: MessageBlock[] = top.map((r) => ({
    type: "commit_ref" as const,
    commitId: r.id,
    sha: r.sha,
    author: r.author,
    summary: r.summary,
  }));

  const text = top
    .map((r) => {
      const date = r.committedAt.toISOString().slice(0, 10);
      const pr = r.prNumber ? ` (PR #${r.prNumber})` : "";
      const files = r.filePaths.slice(0, 3).join(", ");
      return `${r.sha.slice(0, 7)} · ${date} · @${r.author}${pr}\n  ${r.summary}\n  files: ${files}`;
    })
    .join("\n\n");

  return { text, blocks };
};
