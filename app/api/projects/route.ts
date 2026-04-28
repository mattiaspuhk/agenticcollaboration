import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { ingestProject } from "@/lib/ingest/run";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.query.projects.findMany({
    orderBy: [desc(schema.projects.createdAt)],
  });
  return NextResponse.json(
    rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      rootPath: p.rootPath,
      docsPaths: p.docsPaths,
      status: p.status,
      progress: p.ingestProgress,
      ingestError: p.ingestError,
      ingestStartedAt: p.ingestStartedAt?.toISOString() ?? null,
      ingestFinishedAt: p.ingestFinishedAt?.toISOString() ?? null,
    })),
  );
}

const Body = z.object({
  rootPath: z.string().min(1),
  name: z.string().optional(),
  docsPaths: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const rootPath = path.resolve(parsed.data.rootPath);
  let stat;
  try {
    stat = await fs.stat(rootPath);
  } catch {
    return NextResponse.json(
      { error: `Path does not exist: ${rootPath}` },
      { status: 400 },
    );
  }
  if (!stat.isDirectory()) {
    return NextResponse.json(
      { error: `Not a directory: ${rootPath}` },
      { status: 400 },
    );
  }

  const baseName = parsed.data.name ?? path.basename(rootPath);
  const slug = await uniqueSlug(toSlug(baseName));

  const docsPaths = parsed.data.docsPaths ?? (await detectDocPaths(rootPath));

  const [project] = await db
    .insert(schema.projects)
    .values({
      slug,
      name: baseName,
      rootPath,
      docsPaths,
      status: "new",
    })
    .returning();

  // Ensure default channels exist.
  await db.insert(schema.channels).values([
    { projectId: project.id, name: "product" },
    { projectId: project.id, name: "engineering" },
  ]);

  // Kick ingestion in the background. We don't await — the client polls.
  ingestProject(project.id).catch((err) => {
    console.error(`Ingestion failed for ${project.slug}:`, err);
  });

  return NextResponse.json({ id: project.id, slug: project.slug });
}

function toSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const existing = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.slug, candidate),
    });
    if (!existing) return candidate;
    candidate = `${base}-${n++}`;
  }
}

async function detectDocPaths(root: string): Promise<string[]> {
  const candidates = ["wiki", "docs", "documentation"];
  const found: string[] = [];
  for (const c of candidates) {
    try {
      const s = await fs.stat(path.join(root, c));
      if (s.isDirectory()) found.push(c);
    } catch {
      // not present
    }
  }
  return found;
}
