import { NextRequest } from "next/server";
import { runBuildAgent, type BuildEvent } from "@/lib/agent/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: BuildEvent) => {
        const line = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          // Stream may be closed by client; ignore.
        }
      };
      try {
        await runBuildAgent({ featureId: id, emit: send });
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
