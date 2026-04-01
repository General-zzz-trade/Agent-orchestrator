import { test } from "node:test";
import assert from "node:assert/strict";
import { handleHttpTask } from "./http-handler";
import type { RunContext, AgentTask } from "../types";

function makeCtx(): RunContext {
  return { runId: "test", goal: "test", tasks: [], artifacts: [], replanCount: 0,
    nextTaskSequence: 0, insertedTaskCount: 0, llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0, llmReplannerFallbackCount: 0,
    escalationDecisions: [], limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString() } as unknown as RunContext;
}

function makeTask(payload: Record<string, string | number>): AgentTask {
  return { id: "t1", type: "http_request", status: "pending", retries: 0,
    attempts: 0, replanDepth: 0, payload } as unknown as AgentTask;
}

test("http_request: GET public URL returns summary", async () => {
  const ctx = makeCtx();
  const result = await handleHttpTask(ctx, makeTask({ url: "https://httpbin.org/get", method: "GET" }));
  assert.ok(result.summary.includes("200"));
});

test("http_request: missing url throws", async () => {
  await assert.rejects(() => handleHttpTask(makeCtx(), makeTask({ method: "GET" })), /url is required/);
});

test("http_request: invalid method throws", async () => {
  await assert.rejects(
    () => handleHttpTask(makeCtx(), makeTask({ url: "https://httpbin.org/get", method: "HACK" })),
    /invalid method/
  );
});

test("http_request: 4xx throws error", async () => {
  await assert.rejects(
    () => handleHttpTask(makeCtx(), makeTask({ url: "https://httpbin.org/status/404", method: "GET" })),
    /404/
  );
});

test("http_request: artifact stored on success", async () => {
  const ctx = makeCtx();
  await handleHttpTask(ctx, makeTask({ url: "https://httpbin.org/get", method: "GET" }));
  assert.ok(ctx.artifacts.some(a => a.type === "http_response"));
});
