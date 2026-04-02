import type { FastifyInstance } from "fastify";
import { listSessions, deleteSession } from "../../auth/session-store";

export async function sessionsRoutes(app: FastifyInstance): Promise<void> {
  // GET /sessions — list saved sessions for tenant
  app.get("/sessions", async (request, reply) => {
    const sessions = listSessions(request.tenantId);
    return reply.send({ sessions });
  });

  // DELETE /sessions/:domain — delete a saved session
  app.delete<{ Params: { domain: string } }>("/sessions/:domain", async (request, reply) => {
    const { domain } = request.params;
    deleteSession(request.tenantId, domain);
    return reply.code(204).send();
  });
}
