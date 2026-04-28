import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { ingestProject } from "@/lib/ingest/run";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const project = await db.query.projects.findFirst({
    where: UUID_RE.test(id)
      ? eq(schema.projects.id, id)
      : eq(schema.projects.slug, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (project.status === "indexing") {
    return NextResponse.json(
      { error: "Already indexing" },
      { status: 409 },
    );
  }

  ingestProject(project.id, { force }).catch((err) => {
    console.error(`Re-ingest failed for ${project.slug}:`, err);
  });

  return NextResponse.json({ ok: true, force });
}
