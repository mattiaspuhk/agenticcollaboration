import { NextRequest } from "next/server";
import { runSocratic, type SocraticEvent } from "@/lib/agent/socratic";
import { detectFraming } from "@/lib/agent/framing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const discussionId = req.nextUrl.searchParams.get("discussionId");
  if (!discussionId) {
    return new Response("discussionId required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SocraticEvent) => {
        const line = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };
      try {
        await runSocratic({ discussionId, emit: send });
        const framing = await detectFraming(discussionId);
        const line = `event: framing\ndata: ${JSON.stringify(framing)}\n\n`;
        controller.enqueue(encoder.encode(line));
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
