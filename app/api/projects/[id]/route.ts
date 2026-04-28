import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const project = await db.query.projects.findFirst({
    where: UUID_RE.test(id)
      ? eq(schema.projects.id, id)
      : eq(schema.projects.slug, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: project.id,
    slug: project.slug,
    name: project.name,
    rootPath: project.rootPath,
    docsPaths: project.docsPaths,
    status: project.status,
    progress: project.ingestProgress,
    ingestError: project.ingestError,
    ingestStartedAt: project.ingestStartedAt?.toISOString() ?? null,
    ingestFinishedAt: project.ingestFinishedAt?.toISOString() ?? null,
  });
}
