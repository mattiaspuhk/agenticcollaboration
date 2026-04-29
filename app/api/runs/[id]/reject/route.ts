import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const run = await db.query.codeRuns.findFirst({
    where: eq(schema.codeRuns.id, id),
  });
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status === "applied" || run.status === "rejected") {
    return NextResponse.json(
      { error: `run is already ${run.status}` },
      { status: 409 },
    );
  }
  await db
    .update(schema.codeRuns)
    .set({
      status: "rejected",
      finishedAt: new Date(),
    })
    .where(eq(schema.codeRuns.id, run.id));
  return NextResponse.json({ ok: true });
}
