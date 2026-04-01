/**
 * Auto tool generation API routes.
 */
import type { FastifyInstance } from "fastify";
import { generateAndRegisterTool, listGeneratedTools } from "../../plugins/auto/generator";
import { listPlugins } from "../../plugins/registry";

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  // POST /tools/generate — generate and register a new action tool
  app.post<{
    Body: {
      name: string;
      description: string;
      payloadFields: Array<{ name: string; type: "string" | "number" | "boolean"; required: boolean }>;
      implementation?: "http" | "shell" | "custom";
    };
  }>("/tools/generate", {
    schema: {
      body: {
        type: "object",
        required: ["name", "description", "payloadFields"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 60 },
          description: { type: "string", minLength: 1, maxLength: 500 },
          payloadFields: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "type", "required"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["string", "number", "boolean"] },
                required: { type: "boolean" }
              }
            }
          },
          implementation: { type: "string", enum: ["http", "shell", "custom"] }
        }
      }
    }
  }, async (request, reply) => {
    const result = generateAndRegisterTool(request.body);
    return reply.code(result.success ? 201 : 500).send(result);
  });

  // GET /tools — list all plugins (built-in + generated)
  app.get("/tools", async (_req, reply) => {
    return reply.send({
      plugins: listPlugins(),
      generatedTools: listGeneratedTools()
    });
  });
}
