import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  checkoutFreshBranch,
  commitAll,
  ensureGitRepo,
  pushBranch,
  writeChangesToDisk,
} from "@/lib/git";
import { openPullRequest } from "@/lib/github";
import type { CodeChange, LinkedPr } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    prTitle: z.string().min(1).max(200).optional(),
    prBody: z.string().max(20_000).optional(),
    baseBranch: z.string().min(1).max(200).optional(),
    branchName: z.string().min(1).max(200).optional(),
    draft: z.boolean().optional(),
  })
  .partial();

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 },
    );
  }

  const run = await db.query.codeRuns.findFirst({
    where: eq(schema.codeRuns.id, id),
  });
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status !== "awaiting_review") {
    return NextResponse.json(
      { error: `run is ${run.status}, not awaiting_review` },
      { status: 409 },
    );
  }

  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, run.featureId),
  });
  if (!feature) {
    return NextResponse.json({ error: "feature not found" }, { status: 404 });
  }
  if (!feature.githubRepo) {
    return NextResponse.json(
      { error: "feature has no githubRepo set" },
      { status: 400 },
    );
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, feature.projectId),
  });
  if (!project?.rootPath) {
    return NextResponse.json(
      { error: "project has no rootPath" },
      { status: 400 },
    );
  }

  const changes = (run.changes as CodeChange[]) ?? [];
  if (changes.length === 0) {
    return NextResponse.json(
      { error: "run has no changes to apply" },
      { status: 400 },
    );
  }

  const branchName = parsed.data.branchName?.trim() || run.branchName;
  const baseBranch = parsed.data.baseBranch?.trim() || run.baseBranch;
  const prTitle =
    parsed.data.prTitle?.trim() || run.prTitle || feature.title;
  const prBody =
    parsed.data.prBody ?? run.prBody ?? "Changes by build agent.";

  try {
    await ensureGitRepo(project.rootPath);
    await checkoutFreshBranch(project.rootPath, branchName, baseBranch);
    await writeChangesToDisk(project.rootPath, changes);
    const { committed, sha } = await commitAll(project.rootPath, prTitle);
    if (!committed) {
      return NextResponse.json(
        { error: "no diff to commit (writes resulted in identical content)" },
        { status: 400 },
      );
    }
    await pushBranch(project.rootPath, branchName);

    const pr = await openPullRequest(feature.githubRepo, {
      head: branchName,
      base: baseBranch,
      title: prTitle,
      body: prBody,
      draft: parsed.data.draft ?? false,
    });

    const linkedPr: LinkedPr = {
      number: pr.number,
      title: prTitle,
      state: "open",
      url: pr.html_url,
      updatedAt: new Date().toISOString(),
    };
    const existingPrs = (feature.linkedPrIds as LinkedPr[]) ?? [];
    await db
      .update(schema.features)
      .set({
        linkedPrIds: [
          ...existingPrs.filter((p) => p.number !== pr.number),
          linkedPr,
        ],
        branchName,
        updatedAt: new Date(),
      })
      .where(eq(schema.features.id, feature.id));

    await db
      .update(schema.codeRuns)
      .set({
        status: "applied",
        branchName,
        baseSha: sha,
        prTitle,
        prBody,
        prNumber: pr.number,
        prUrl: pr.html_url,
        finishedAt: new Date(),
      })
      .where(eq(schema.codeRuns.id, run.id));

    await db.insert(schema.messages).values({
      threadKind: "feature",
      containerId: feature.id,
      authorKind: "system",
      authorPersona: "system",
      authorLabel: "System",
      bodyMd: `Agent opened PR [#${pr.number}](${pr.html_url}) — ${prTitle}`,
      blocks: [],
    });

    return NextResponse.json({
      ok: true,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branchName,
      sha,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.codeRuns)
      .set({
        status: "error",
        errorMessage: msg,
        finishedAt: new Date(),
      })
      .where(eq(schema.codeRuns.id, run.id));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
