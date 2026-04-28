import { NextRequest, NextResponse } from "next/server";
import { pollFeature } from "@/lib/agent/statusInferrer";
import { runSummarizer } from "@/lib/agent/summarizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = await pollFeature(id);
  if (result.ok) {
    runSummarizer(id).catch((err) =>
      console.warn("[poll] summarizer post-poll failed:", err),
    );
  }
  return NextResponse.json(result);
}
