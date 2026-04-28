import { NextRequest } from "next/server";
import {
  runFeatureChat,
  type FeatureChatEvent,
} from "@/lib/agent/featureChat";
import { scheduleSummarizer } from "@/lib/agent/summarizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const featureId = req.nextUrl.searchParams.get("featureId");
  if (!featureId) {
    return new Response("featureId required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: FeatureChatEvent) => {
        const line = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };
      try {
        await runFeatureChat({ featureId, emit: send });
        scheduleSummarizer(featureId, 1500);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ event: "error", data: { message: msg } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
