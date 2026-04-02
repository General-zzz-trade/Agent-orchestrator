import type { FastifyInstance } from "fastify";
import { getPendingApprovals, respondToApproval } from "../../approval/gate";

export async function approvalsRoutes(app: FastifyInstance): Promise<void> {
  // GET /approvals?runId=xxx — list pending approvals
  app.get<{ Querystring: { runId?: string } }>("/approvals", async (request, reply) => {
    const { runId } = request.query;
    if (!runId) {
      return reply.code(400).send({ error: "runId query parameter is required" });
    }
    const approvals = getPendingApprovals(runId);
    return reply.send({ approvals });
  });

  // POST /approvals/:id/respond — approve or reject
  app.post<{ Params: { id: string }; Body: { approved: boolean; respondedBy?: string } }>(
    "/approvals/:id/respond",
    {
      schema: {
        body: {
          type: "object",
          required: ["approved"],
          properties: {
            approved: { type: "boolean" },
            respondedBy: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params;
      const { approved, respondedBy } = request.body;
      const result = respondToApproval(id, approved, respondedBy);
      if (!result) {
        return reply.code(404).send({ error: "Approval request not found or already responded" });
      }
      return reply.send(result);
    }
  );
}
