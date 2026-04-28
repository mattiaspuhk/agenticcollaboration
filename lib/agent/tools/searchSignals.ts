import { db, schema } from "@/db/client";
import { embedQuery } from "@/lib/embed";
import { sql, gte, and, eq } from "drizzle-orm";
import type { ToolHandler } from "./index";
import type { MessageBlock, SignalRef } from "@/db/schema";

type SignalSource = "feedback" | "errors" | "chat_history";

export const searchSignals: ToolHandler = async (args, ctx) => {
  const query = String(args.query ?? "");
  const sources = Array.isArray(args.sources)
    ? (args.sources as SignalSource[])
    : (["feedback", "errors", "chat_history"] as SignalSource[]);
  const days = Number(args.days ?? 30);
  if (!query) return { text: "search_signals: missing query" };

  const since = new Date(Date.now() - days * 86400_000);
  const vec = await embedQuery(query);
  const literal = `[${vec.join(",")}]`;

  const refs: SignalRef[] = [];
  const lines: string[] = [];

  if (sources.includes("feedback")) {
    const rows = await db
      .select({
        id: schema.feedback.id,
        customer: schema.feedback.customer,
        content: schema.feedback.content,
        receivedAt: schema.feedback.receivedAt,
      })
      .from(schema.feedback)
      .where(
        and(
          eq(schema.feedback.projectId, ctx.projectId),
          gte(schema.feedback.receivedAt, since),
        ),
      )
      .orderBy(sql`embedding <=> ${literal}::vector`)
      .limit(5);
    for (const r of rows) {
      const date = r.receivedAt.toISOString().slice(0, 10);
      refs.push({
        source: "feedback",
        id: r.id,
        label: `${r.customer}: "${r.content.slice(0, 80)}${r.content.length > 80 ? "…" : ""}"`,
        occurredAt: date,
      });
      lines.push(`[feedback ${date}] ${r.customer}: ${r.content}`);
    }
  }

  if (sources.includes("errors")) {
    const rows = await db
      .select({
        id: schema.errors.id,
        message: schema.errors.message,
        filePath: schema.errors.filePath,
        line: schema.errors.line,
        lastSeen: schema.errors.lastSeen,
        count: schema.errors.count,
      })
      .from(schema.errors)
      .where(
        and(
          eq(schema.errors.projectId, ctx.projectId),
          gte(schema.errors.lastSeen, since),
        ),
      )
      .orderBy(sql`embedding <=> ${literal}::vector`)
      .limit(5);
    for (const r of rows) {
      const date = r.lastSeen.toISOString().slice(0, 10);
      const loc = r.filePath ? ` at ${r.filePath}${r.line ? `:${r.line}` : ""}` : "";
      refs.push({
        source: "errors",
        id: r.id,
        label: `${r.message}${loc} (${r.count}× last 30d)`,
        occurredAt: date,
      });
      lines.push(`[error ${date}] ${r.message}${loc} count=${r.count}`);
    }
  }

  if (sources.includes("chat_history")) {
    const rows = await db
      .select({
        id: schema.chatHistory.id,
        channel: schema.chatHistory.channel,
        author: schema.chatHistory.author,
        content: schema.chatHistory.content,
        occurredAt: schema.chatHistory.occurredAt,
      })
      .from(schema.chatHistory)
      .where(
        and(
          eq(schema.chatHistory.projectId, ctx.projectId),
          gte(schema.chatHistory.occurredAt, since),
        ),
      )
      .orderBy(sql`embedding <=> ${literal}::vector`)
      .limit(5);
    for (const r of rows) {
      const date = r.occurredAt.toISOString().slice(0, 10);
      refs.push({
        source: "chat_history",
        id: r.id,
        label: `@${r.author} in #${r.channel}: ${r.content.slice(0, 80)}${r.content.length > 80 ? "…" : ""}`,
        occurredAt: date,
      });
      lines.push(`[#${r.channel} ${date}] @${r.author}: ${r.content}`);
    }
  }

  if (refs.length === 0) {
    return { text: `No signals found for "${query}" in the last ${days} days.` };
  }

  const text = `Found ${refs.length} signals across ${
    new Set(refs.map((r) => r.source)).size
  } sources in the last ${days} days:\n\n${lines.join("\n")}`;

  const blocks: MessageBlock[] = [{ type: "signal_card", signals: refs }];

  return { text, blocks };
};
