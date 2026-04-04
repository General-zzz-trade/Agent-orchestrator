import type { FastifyInstance } from "fastify";
import { planExploration, createExplorationReport, DEFAULT_EXPLORATION_CONFIG } from "../../exploration/explorer";
import type { ExplorationConfig } from "../../exploration/explorer";
import { createCausalGraph } from "../../world-model/causal-graph";
import { selectNextExplorationAction, curiosityScore } from "../../exploration/proactive-explorer";

export async function exploreRoutes(app: FastifyInstance): Promise<void> {
  // POST /explore — plan an exploration of a URL
  app.post<{
    Body: { url: string; maxSteps?: number; maxDepth?: number }
  }>("/explore", {
    schema: {
      body: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1 },
          maxSteps: { type: "number", minimum: 1, maximum: 100 },
          maxDepth: { type: "number", minimum: 1, maximum: 10 }
        }
      }
    }
  }, async (request, reply) => {
    const { url, maxSteps, maxDepth } = request.body;
    const config: ExplorationConfig = {
      ...DEFAULT_EXPLORATION_CONFIG,
      ...(maxSteps !== undefined && { maxSteps }),
      ...(maxDepth !== undefined && { maxDepth })
    };

    // Plan exploration (without live browser — returns planned actions)
    const plan = planExploration(url, [], new Set(), config);

    // Use proactive explorer's curiosity scoring to rank and select next action
    let curiosityEnhanced: { nextAction?: unknown; score?: number } = {};
    try {
      const graph = createCausalGraph();
      const visitCounts = new Map<string, number>();
      const elements = plan.actions.map((a: { selector?: string; text?: string; type?: string }) => ({
        selector: String(a.selector ?? ""),
        text: String(a.text ?? ""),
        type: String(a.type ?? "link")
      }));
      const nextAction = selectNextExplorationAction("page:unknown", graph, visitCounts, elements);
      curiosityEnhanced = { nextAction };
    } catch (_err) {
      // Proactive explorer is optional — fall back to default plan
    }

    return reply.send({
      url,
      plannedActions: plan.actions.length,
      actions: plan.actions,
      curiosity: curiosityEnhanced,
      config: {
        maxSteps: config.maxSteps,
        maxDepth: config.maxDepth,
        timeout: config.timeout
      }
    });
  });
}
