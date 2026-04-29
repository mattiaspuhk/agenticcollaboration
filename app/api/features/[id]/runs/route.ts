import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { reapStaleRuns } from "@/lib/agent/build";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await reapStaleRuns(id);
  const rows = await db.query.codeRuns.findMany({
    where: eq(schema.codeRuns.featureId, id),
    orderBy: [desc(schema.codeRuns.createdAt)],
    limit: 10,
  });
  return NextResponse.json({
    runs: rows.map((r) => ({
      id: r.id,
      status: r.status,
      branchName: r.branchName,
      baseBranch: r.baseBranch,
      prTitle: r.prTitle,
      prNumber: r.prNumber,
      prUrl: r.prUrl,
      changeCount: (r.changes ?? []).length,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  });
}
