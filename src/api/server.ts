import Fastify from "fastify";
import cors from "@fastify/cors";
import { runsRoutes } from "./routes/runs";

export async function buildServer() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(runsRoutes, { prefix: "/api/v1" });

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  return app;
}

async function main() {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  const app = await buildServer();
  await app.listen({ port, host });
  console.log(`Agent API listening on http://${host}:${port}`);
  console.log(`  POST /api/v1/runs        - submit goal (async)`);
  console.log(`  GET  /api/v1/runs        - list runs`);
  console.log(`  GET  /api/v1/runs/:id    - run detail`);
  console.log(`  GET  /api/v1/runs/:id/status    - live status`);
  console.log(`  GET  /api/v1/runs/:id/artifacts - artifacts`);
  console.log(`  GET  /health             - health check`);
}

void main();
