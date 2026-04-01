import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCodeTask } from "./code-handler";
import type { RunContext, AgentTask } from "../types";

function makeCtx(): RunContext {
  return {
    runId: "test-run",
    goal: "test",
    tasks: [],
    artifacts: [],
    replanCount: 0,
    nextTaskSequence: 0,
    insertedTaskCount: 0,
    llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0,
    llmReplannerFallbackCount: 0,
    escalationDecisions: [],
    limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString()
  } as unknown as RunContext;
}

function makeTask(payload: Record<string, string | number>): AgentTask {
  return {
    id: "task-code-1",
    type: "run_code",
    status: "pending",
    retries: 0,
    attempts: 0,
    replanDepth: 0,
    payload
  } as unknown as AgentTask;
}

test("run_code: javascript console.log", async () => {
  const ctx = makeCtx();
  const result = await handleCodeTask(ctx, makeTask({ language: "javascript", code: 'console.log("hello world")' }));
  assert.ok(result.summary.includes("hello world"));
});

test("run_code: javascript math computation", async () => {
  const ctx = makeCtx();
  const result = await handleCodeTask(ctx, makeTask({ language: "javascript", code: "console.log(2 + 2)" }));
  assert.ok(result.summary.includes("4"));
});

test("run_code: shell echo", async () => {
  const ctx = makeCtx();
  const result = await handleCodeTask(ctx, makeTask({ language: "shell", code: "echo hello_from_shell" }));
  assert.ok(result.summary.includes("hello_from_shell"));
});

test("run_code: python print", async () => {
  const ctx = makeCtx();
  const result = await handleCodeTask(ctx, makeTask({ language: "python", code: 'print("py_output")' }));
  assert.ok(result.summary.includes("py_output"));
});

test("run_code: non-zero exit throws", async () => {
  const ctx = makeCtx();
  await assert.rejects(
    () => handleCodeTask(ctx, makeTask({ language: "shell", code: "exit 1" })),
    /exited 1/
  );
});

test("run_code: empty code throws", async () => {
  const ctx = makeCtx();
  await assert.rejects(
    () => handleCodeTask(ctx, makeTask({ language: "javascript", code: "" })),
    /empty/
  );
});

test("run_code: unsupported language throws", async () => {
  const ctx = makeCtx();
  await assert.rejects(
    () => handleCodeTask(ctx, makeTask({ language: "ruby", code: "puts 'hello'" })),
    /unsupported language/
  );
});

test("run_code: artifacts stored on success", async () => {
  const ctx = makeCtx();
  await handleCodeTask(ctx, makeTask({ language: "javascript", code: 'console.log("artifact_test")' }));
  assert.ok(ctx.artifacts.some(a => a.type === "code_output"));
});
