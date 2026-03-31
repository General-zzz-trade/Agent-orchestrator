import test from "node:test";
import assert from "node:assert/strict";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { planTasks } from "./planner";

test("openai-compatible planner returns tasks on valid response", async () => {
  const server = await startProviderServer((_request, response) => {
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tasks: [
                { type: "open_page", payload: { url: "https://example.com" } },
                { type: "screenshot", payload: { outputPath: "artifacts/provider-smoke.png" } }
              ]
            })
          }
        }
      ]
    }));
  });

  await withPlannerEnv(server.url, async () => {
    const result = await planTasks('capture "https://example.com"', {
      runId: "smoke-valid",
      mode: "llm",
      maxLLMPlannerCalls: 1
    });

    assert.equal(result.plannerUsed, "llm");
    assert.equal(result.tasks.length, 2);
  });

  await server.close();
});

test("openai-compatible planner reports timeout", async () => {
  const server = await startProviderServer(async (_request, response) => {
    await delay(200);
    response.end(JSON.stringify({ choices: [] }));
  });

  await withPlannerEnv(server.url, async () => {
    process.env.LLM_PLANNER_TIMEOUT_MS = "50";
    const result = await planTasks('capture "https://example.com"', {
      runId: "smoke-timeout",
      mode: "llm",
      maxLLMPlannerCalls: 1
    });

    assert.equal(result.plannerUsed, "none");
    assert.equal(result.decisionTrace.timeoutCount, 1);
  });

  await server.close();
});

test("openai-compatible planner handles empty response", async () => {
  const server = await startProviderServer((_request, response) => {
    response.end(JSON.stringify({ choices: [{ message: { content: "" } }] }));
  });

  await withPlannerEnv(server.url, async () => {
    const result = await planTasks('capture "https://example.com"', {
      runId: "smoke-empty",
      mode: "llm",
      maxLLMPlannerCalls: 1
    });

    assert.equal(result.plannerUsed, "none");
  });

  await server.close();
});

test("openai-compatible planner handles invalid JSON content", async () => {
  const server = await startProviderServer((_request, response) => {
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: "{not-valid-json"
          }
        }
      ]
    }));
  });

  await withPlannerEnv(server.url, async () => {
    const result = await planTasks('capture "https://example.com"', {
      runId: "smoke-invalid-json",
      mode: "llm",
      maxLLMPlannerCalls: 1
    });

    assert.equal(result.plannerUsed, "none");
  });

  await server.close();
});

test("openai-compatible planner falls back on low-quality output", async () => {
  const server = await startProviderServer((_request, response) => {
    response.end(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tasks: [{ type: "screenshot", payload: { outputPath: "artifacts/only-shot.png" } }]
            })
          }
        }
      ]
    }));
  });

  await withPlannerEnv(server.url, async () => {
    const result = await planTasks(
      'launch local app using "npm run dev" then wait until "http://localhost:3000" is ready and open "http://localhost:3000" and confirm "Dashboard" appears then capture screenshot',
      {
        runId: "smoke-low-quality",
        mode: "auto",
        maxLLMPlannerCalls: 1,
        policy: {
          plannerCostMode: "aggressive",
          replannerCostMode: "balanced",
          preferRuleSystemsOnCheapGoals: false,
          allowLLMReplannerForSimpleFailures: false
        }
      }
    );

    assert.notEqual(result.plannerUsed, "llm");
    assert.equal(result.decisionTrace.llmInvocations, 1);
    assert.ok(typeof result.fallbackReason === "string");
  });

  await server.close();
});

async function withPlannerEnv(url: string, fn: () => Promise<void>): Promise<void> {
  const previous = {
    provider: process.env.LLM_PLANNER_PROVIDER,
    model: process.env.LLM_PLANNER_MODEL,
    apiKey: process.env.LLM_PLANNER_API_KEY,
    baseUrl: process.env.LLM_PLANNER_BASE_URL,
    timeout: process.env.LLM_PLANNER_TIMEOUT_MS,
    maxTokens: process.env.LLM_PLANNER_MAX_TOKENS,
    temperature: process.env.LLM_PLANNER_TEMPERATURE
  };

  process.env.LLM_PLANNER_PROVIDER = "openai-compatible";
  process.env.LLM_PLANNER_MODEL = "smoke-model";
  process.env.LLM_PLANNER_API_KEY = "test-key";
  process.env.LLM_PLANNER_BASE_URL = url;
  process.env.LLM_PLANNER_TIMEOUT_MS = "500";
  process.env.LLM_PLANNER_MAX_TOKENS = "200";
  process.env.LLM_PLANNER_TEMPERATURE = "0.1";

  try {
    await fn();
  } finally {
    restoreEnv("LLM_PLANNER_PROVIDER", previous.provider);
    restoreEnv("LLM_PLANNER_MODEL", previous.model);
    restoreEnv("LLM_PLANNER_API_KEY", previous.apiKey);
    restoreEnv("LLM_PLANNER_BASE_URL", previous.baseUrl);
    restoreEnv("LLM_PLANNER_TIMEOUT_MS", previous.timeout);
    restoreEnv("LLM_PLANNER_MAX_TOKENS", previous.maxTokens);
    restoreEnv("LLM_PLANNER_TEMPERATURE", previous.temperature);
  }
}

async function startProviderServer(
  handler: (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>
  ) => void | Promise<void>
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    void handler(request, response);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start smoke-test provider server.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
