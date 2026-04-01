import type { FastifyInstance } from "fastify";
import { getOrCreateEmitter, hasEmitter } from "../../streaming/event-bus";

export async function streamRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/runs/:id/stream", async (request, reply) => {
    const { id } = request.params;

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    const sendEvent = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // If run already finished (no emitter), send a synthetic done event
    if (!hasEmitter(id)) {
      sendEvent({ type: "run_not_found_or_complete", runId: id });
      reply.raw.end();
      return;
    }

    const emitter = getOrCreateEmitter(id);

    const onEvent = (event: unknown) => sendEvent(event);
    const onClose = () => { reply.raw.end(); };

    emitter.on("event", onEvent);
    emitter.once("close", onClose);

    // Clean up if client disconnects
    request.raw.on("close", () => {
      emitter.off("event", onEvent);
      emitter.off("close", onClose);
    });

    // Keep alive ping every 15s
    const ping = setInterval(() => {
      if (reply.raw.writable) {
        reply.raw.write(": ping\n\n");
      } else {
        clearInterval(ping);
      }
    }, 15000);

    emitter.once("close", () => clearInterval(ping));
    request.raw.on("close", () => clearInterval(ping));
  });
}
