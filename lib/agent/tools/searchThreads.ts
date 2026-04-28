import { db, schema } from "@/db/client";
import { embedQuery } from "@/lib/embed";
import { sql, and, eq, ne, isNotNull, gte } from "drizzle-orm";
import type { ToolHandler } from "./index";
import type { MessageBlock, SignalRef } from "@/db/schema";

export const searchThreads: ToolHandler = async (args, ctx) => {
  const query = String(args.query ?? "");
  const days = Number(args.days ?? 90);
  const limit = Math.min(Number(args.limit ?? 8), 20);
  const includeCurrent = args.include_current_thread === true;
  if (!query) return { text: "search_threads: missing query" };

  const since = new Date(Date.now() - days * 86400_000);
  const vec = await embedQuery(query);
  const literal = `[${vec.join(",")}]`;

  const conditions = [
    eq(schema.channels.projectId, ctx.projectId),
    isNotNull(schema.messages.embedding),
    gte(schema.messages.createdAt, since),
  ];
  if (!includeCurrent) {
    conditions.push(ne(schema.messages.threadId, ctx.threadId));
  }

  const rows = await db
    .select({
      id: schema.messages.id,
      threadId: schema.messages.threadId,
      threadTitle: schema.threads.title,
      channel: schema.channels.name,
      author: schema.messages.authorLabel,
      authorPersona: schema.messages.authorPersona,
      bodyMd: schema.messages.bodyMd,
      createdAt: schema.messages.createdAt,
      distance: sql<number>`(${schema.messages.embedding} <=> ${literal}::vector)`,
    })
    .from(schema.messages)
    .innerJoin(
      schema.threads,
      eq(schema.threads.id, schema.messages.threadId),
    )
    .innerJoin(
      schema.channels,
      eq(schema.channels.id, schema.threads.channelId),
    )
    .where(and(...conditions))
    .orderBy(sql`(${schema.messages.embedding} <=> ${literal}::vector)`)
    .limit(limit);

  if (rows.length === 0) {
    const scope = includeCurrent ? "any thread" : "other threads";
    return {
      text: `search_threads: no in-app messages found in ${scope} for "${query}" (last ${days} days).`,
    };
  }

  const refs: SignalRef[] = rows.map((r) => {
    const date = r.createdAt.toISOString().slice(0, 10);
    const snippet =
      r.bodyMd.length > 100 ? `${r.bodyMd.slice(0, 100)}…` : r.bodyMd;
    return {
      source: "chat_history",
      id: r.id,
      label: `${r.author} in #${r.channel} / "${r.threadTitle}": ${snippet}`,
      occurredAt: date,
    };
  });

  const lines = rows.map((r) => {
    const date = r.createdAt.toISOString().slice(0, 16).replace("T", " ");
    return `[#${r.channel} · "${r.threadTitle}" · ${date} · ${r.author}]\n${r.bodyMd}`;
  });

  const text = `Found ${rows.length} prior in-app message${
    rows.length === 1 ? "" : "s"
  } across this project's threads (last ${days} days, ranked by relevance):\n\n${lines.join(
    "\n\n---\n\n",
  )}`;

  const blocks: MessageBlock[] = [{ type: "signal_card", signals: refs }];
  return { text, blocks };
};
