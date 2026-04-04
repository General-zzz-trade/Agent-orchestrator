import type { FastifyInstance } from "fastify";
import {
  planCoordination,
  getReadyWorkers,
  generateReport
} from "../../orchestration/coordinator";
import { coordinateHTN } from "../../orchestration/htn-coordinator";

export async function coordinateRoutes(app: FastifyInstance): Promise<void> {
  // POST /coordinate — plan a multi-agent coordination for a goal
  app.post<{
    Body: { goal: string }
  }>("/coordinate", {
    schema: {
      body: {
        type: "object",
        required: ["goal"],
        properties: {
          goal: { type: "string", minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const plan = planCoordination(request.body.goal);
    const ready = getReadyWorkers(plan);

    // When strategy allows parallel execution, use HTN coordinator
    let htnResult: unknown = null;
    if (plan.strategy === "parallel" || (plan.strategy as string) === "fan-out") {
      try {
        htnResult = await coordinateHTN(request.body.goal, async (subGoal: string) => {
          // Delegate sub-goals back through the basic coordinator
          const subPlan = planCoordination(subGoal);
          return { success: true, summary: subGoal, artifacts: [], durationMs: 0 };
        });
      } catch (_err) {
        // HTN coordinator is optional — fall back to basic coordination
      }
    }

    return reply.send({
      originalGoal: plan.originalGoal,
      strategy: plan.strategy,
      workers: plan.workers.map(w => ({
        id: w.id,
        goal: w.goal,
        status: w.status
      })),
      readyWorkers: ready.map(w => w.id),
      dependencies: Object.fromEntries(plan.dependencies),
      ...(htnResult ? { htnPlan: htnResult } : {})
    });
  });
}
