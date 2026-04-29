import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { unifiedDiff } from "@/lib/diff";
import type { CodeChange } from "@/db/schema";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const run = await db.query.codeRuns.findFirst({
    where: eq(schema.codeRuns.id, id),
  });
  if (!run) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, run.featureId),
  });

  const changes = (run.changes as CodeChange[]) ?? [];
  const diffs = changes.map((c) => {
    const { patch, stats } = unifiedDiff(c.oldContent, c.newContent, c.path);
    return {
      path: c.path,
      kind: c.kind,
      patch,
      stats,
    };
  });

  return NextResponse.json({
    run: {
      id: run.id,
      featureId: run.featureId,
      status: run.status,
      branchName: run.branchName,
      baseBranch: run.baseBranch,
      prTitle: run.prTitle,
      prBody: run.prBody,
      prNumber: run.prNumber,
      prUrl: run.prUrl,
      errorMessage: run.errorMessage,
      log: run.log ?? [],
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    },
    feature: feature
      ? {
          id: feature.id,
          slug: feature.slug,
          title: feature.title,
          githubRepo: feature.githubRepo,
          branchName: feature.branchName,
          projectId: feature.projectId,
        }
      : null,
    diffs,
  });
}
