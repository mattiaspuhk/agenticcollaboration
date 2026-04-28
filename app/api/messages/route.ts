import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { PERSONAS } from "@/lib/personas";
import { embedMessageBodyFireAndForget } from "@/lib/embedMessage";
import { scheduleSummarizer } from "@/lib/agent/summarizer";

const Body = z.union([
  z.object({
    threadId: z.string().uuid(),
    persona: z.enum(["pm", "engineer", "designer"]),
    body: z.string().min(1).max(8000),
  }),
  z.object({
    threadKind: z.enum(["discussion", "feature"]),
    containerId: z.string().uuid(),
    persona: z.enum(["pm", "engineer", "designer", "user"]),
    body: z.string().min(1).max(8000),
    authorLabel: z.string().min(1).max(80).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  if ("threadId" in parsed.data) {
    const { threadId, persona, body } = parsed.data;
    const persona_def = PERSONAS[persona];
    const [m] = await db
      .insert(schema.messages)
      .values({
        threadId,
        threadKind: "thread",
        authorKind: "user",
        authorPersona: persona,
        authorLabel: persona_def.label,
        bodyMd: body,
        blocks: [],
      })
      .returning();
    embedMessageBodyFireAndForget(m.id, body);
    return NextResponse.json({ id: m.id });
  }

  const { threadKind, containerId, persona, body, authorLabel } = parsed.data;
  const personaKey = persona === "user" ? "system" : persona;
  const personaDef =
    persona === "user"
      ? { label: authorLabel ?? "End user" }
      : PERSONAS[personaKey];
  const label = authorLabel ?? personaDef.label;

  const [m] = await db
    .insert(schema.messages)
    .values({
      threadKind,
      containerId,
      authorKind: "user",
      authorPersona: persona,
      authorLabel: label,
      bodyMd: body,
      blocks: [],
    })
    .returning();
  embedMessageBodyFireAndForget(m.id, body);

  if (threadKind === "feature") {
    await db
      .update(schema.features)
      .set({ updatedAt: new Date() })
      .where(eq(schema.features.id, containerId));
    scheduleSummarizer(containerId);
  } else if (threadKind === "discussion") {
    await db
      .update(schema.discussions)
      .set({ updatedAt: new Date() })
      .where(eq(schema.discussions.id, containerId));
  }

  return NextResponse.json({ id: m.id });
}
