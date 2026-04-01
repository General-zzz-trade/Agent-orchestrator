import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../../db/client";
import { CREATE_API_KEYS_TABLE } from "../../db/schema";

// Ensure api_keys table exists
export function initApiKeysTable(): void {
  const db = getDb();
  db.exec(CREATE_API_KEYS_TABLE);
}

export function createApiKey(name: string, tenantId = "default"): string {
  const db = getDb();
  const key = `ak_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  db.prepare("INSERT INTO api_keys (key, name, tenant_id) VALUES (?, ?, ?)").run(key, name, tenantId);
  return key;
}

export function validateApiKey(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT tenant_id FROM api_keys WHERE key = ? AND enabled = 1").get(key) as { tenant_id: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE key = ?").run(key);
  return row.tenant_id;
}

// Extend FastifyRequest to carry tenantId
declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
  }
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  const BYPASS_AUTH = process.env.AGENT_API_AUTH === "false";

  app.decorateRequest("tenantId", "default");

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (BYPASS_AUTH) {
      request.tenantId = process.env.DEFAULT_TENANT_ID ?? "default";
      return;
    }
    // Skip auth for health check and Prometheus scraping
    if (request.url === "/health" || request.url === "/metrics") return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    const tenantId = apiKey ? validateApiKey(apiKey) : null;
    if (!tenantId) {
      return reply.code(401).send({ error: "Unauthorized: provide a valid X-Api-Key header" });
    }
    request.tenantId = tenantId;
  });
}
