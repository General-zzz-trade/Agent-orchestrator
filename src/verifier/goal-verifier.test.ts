import test from "node:test";
import assert from "node:assert/strict";
import { verifyGoalProgress } from "./goal-verifier";
import type { RunContext } from "../types";
import type { AgentObservation } from "../cognition/types";

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run-test",
    goal: "test goal",
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
    startedAt: new Date().toISOString(),
    ...overrides
  };
}

function makeObservation(overrides: Partial<AgentObservation> = {}): AgentObservation {
  return {
    id: "obs-1",
    runId: "run-test",
    timestamp: new Date().toISOString(),
    source: "task_observe",
    anomalies: [],
    confidence: 0.8,
    ...overrides
  };
}

test("strategy 1: passes when quoted text found in visible text", async () => {
  const ctx = makeContext({ goal: 'assert text "Welcome back"' });
  const obs = makeObservation({ visibleText: ["Welcome back, user!"] });
  const result = await verifyGoalProgress(ctx, obs);
  assert.equal(result.passed, true);
  assert.ok(result.confidence >= 0.7);
});

test("strategy 1: fails when quoted text not found", async () => {
  const ctx = makeContext({ goal: 'assert text "Welcome back"' });
  const obs = makeObservation({ visibleText: ["Login page"] });
  const result = await verifyGoalProgress(ctx, obs);
  assert.equal(result.passed, false);
  assert.ok(result.confidence >= 0.5);
});

test("strategy 2: passes with high task completion ratio", async () => {
  const ctx = makeContext({
    goal: "open the dashboard and take a screenshot",
    tasks: [
      { id: "t1", type: "open_page", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: {} },
      { id: "t2", type: "screenshot", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: {} }
    ],
    verificationResults: [
      { runId: "run-test", taskId: "t1", verifier: "action", passed: true, confidence: 0.8, rationale: "ok", evidence: [] },
      { runId: "run-test", taskId: "t2", verifier: "action", passed: true, confidence: 0.8, rationale: "ok", evidence: [] }
    ]
  });
  const obs = makeObservation({ visibleText: ["Dashboard"] });
  const result = await verifyGoalProgress(ctx, obs);
  assert.equal(result.passed, true);
  assert.ok(result.confidence >= 0.6);
});

test("strategy 2: fails with low task completion and failed verifications", async () => {
  const ctx = makeContext({
    goal: "open the dashboard and click login",
    tasks: [
      { id: "t1", type: "open_page", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: {} },
      { id: "t2", type: "click", status: "failed", retries: 1, attempts: 2, replanDepth: 0, payload: {} }
    ],
    verificationResults: [
      { runId: "run-test", taskId: "t1", verifier: "action", passed: true, confidence: 0.8, rationale: "ok", evidence: [] },
      { runId: "run-test", taskId: "t2", verifier: "action", passed: false, confidence: 0.55, rationale: "fail", evidence: [] }
    ]
  });
  const obs = makeObservation({ visibleText: ["Login"] });
  const result = await verifyGoalProgress(ctx, obs);
  assert.equal(result.passed, false);
});

test("no quoted text and no tasks yields low confidence", async () => {
  const ctx = makeContext({ goal: "do something" });
  const obs = makeObservation();
  const result = await verifyGoalProgress(ctx, obs);
  assert.ok(result.confidence <= 0.5);
});
