import { NextRequest, NextResponse } from "next/server";
import { runSummarizer } from "@/lib/agent/summarizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await runSummarizer(id);
  return NextResponse.json({ ok: true });
}
