import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { and, desc, eq } from "drizzle-orm";

const Body = z.object({
  projectSlug: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("projectSlug");
  if (!slug) {
    return NextResponse.json({ error: "projectSlug required" }, { status: 400 });
  }
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.slug, slug),
  });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const rows = await db.query.discussions.findMany({
    where: eq(schema.discussions.projectId, project.id),
    orderBy: [desc(schema.discussions.updatedAt)],
  });
  return NextResponse.json({
    discussions: rows.map((d) => ({
      id: d.id,
      title: d.title,
      state: d.state,
      framingState: d.framingState,
      graduatedToFeatureId: d.graduatedToFeatureId,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { projectSlug, title } = parsed.data;
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.slug, projectSlug),
  });
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const [d] = await db
    .insert(schema.discussions)
    .values({
      projectId: project.id,
      title: title?.trim() || untitled(),
      state: "open",
    })
    .returning();
  return NextResponse.json({ id: d.id });
}

function untitled() {
  const now = new Date();
  const stamp = now.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Discovery · ${stamp}`;
}

export async function PATCH(req: NextRequest) {
  const Patch = z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    state: z.enum(["open", "dropped"]).optional(),
    droppedReason: z.string().max(400).optional(),
  });
  const json = await req.json();
  const parsed = Patch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const updates: Partial<typeof schema.discussions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title) updates.title = parsed.data.title;
  if (parsed.data.state) {
    updates.state = parsed.data.state;
    if (parsed.data.state === "dropped") {
      updates.droppedAt = new Date();
      if (parsed.data.droppedReason)
        updates.droppedReason = parsed.data.droppedReason;
    }
  }
  await db
    .update(schema.discussions)
    .set(updates)
    .where(
      and(
        eq(schema.discussions.id, parsed.data.id),
        eq(schema.discussions.state, "open"),
      ),
    );
  return NextResponse.json({ ok: true });
}
