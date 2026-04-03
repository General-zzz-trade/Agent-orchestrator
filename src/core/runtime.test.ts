import test from "node:test";
import assert from "node:assert/strict";
import type { AgentTask, RunContext } from "../types";
import type { AgentObservation } from "../cognition/types";

function makeObservation(runId: string, taskId?: string): AgentObservation {
  return {
    id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    runId,
    taskId,
    timestamp: new Date().toISOString(),
    source: "task_observe",
    visibleText: ["Page content"],
    anomalies: [],
    confidence: 0.8
  };
}

test("runGoal rejects empty goal", async () => {
  const { runGoal } = await import("./runtime");
  const result = await runGoal("");
  assert.equal(result.result?.success, false);
  assert.match(result.result?.message ?? "", /goal is required/i);
});

test("verifyActionResult is correctly integrated", async () => {
  const { verifyActionResult } = await import("../verifier/action-verifier");

  const ctx: RunContext = {
    runId: "run-integration-test",
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
  };

  const task: AgentTask = {
    id: "t-1",
    type: "click",
    status: "done",
    retries: 0,
    attempts: 1,
    replanDepth: 0,
    payload: { selector: "#btn" }
  };

  const obs = makeObservation("run-integration-test", "t-1");
  const result = await verifyActionResult(ctx, task, obs);

  assert.equal(result.verifier, "action");
  assert.equal(result.passed, true);
  assert.equal(result.runId, "run-integration-test");
});

test("verifyGoalProgress returns result for unquoted goals using task completion", async () => {
  const { verifyGoalProgress } = await import("../verifier/goal-verifier");

  const ctx: RunContext = {
    runId: "run-goal-test",
    goal: "navigate to dashboard",
    tasks: [
      { id: "t1", type: "open_page", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: { url: "http://localhost/dashboard" } },
      { id: "t2", type: "click", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: { selector: "#nav" } }
    ],
    artifacts: [],
    replanCount: 0,
    nextTaskSequence: 2,
    insertedTaskCount: 0,
    llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0,
    llmReplannerFallbackCount: 0,
    escalationDecisions: [],
    verificationResults: [
      { runId: "run-goal-test", taskId: "t1", verifier: "action", passed: true, confidence: 0.8, rationale: "ok", evidence: [] },
      { runId: "run-goal-test", taskId: "t2", verifier: "action", passed: true, confidence: 0.8, rationale: "ok", evidence: [] }
    ],
    limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString()
  };

  const obs = makeObservation("run-goal-test");
  const result = await verifyGoalProgress(ctx, obs);

  assert.equal(result.verifier, "goal");
  assert.equal(result.passed, true);
  assert.ok(result.confidence > 0.5, `Expected confidence > 0.5 but got ${result.confidence}`);
});

test("verifyStateResult reports inconsistency for open_page with URL mismatch", async () => {
  const { verifyStateResult } = await import("../verifier/state-verifier");

  const ctx: RunContext = {
    runId: "run-state-test",
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
    worldState: {
      runId: "run-state-test",
      timestamp: new Date().toISOString(),
      appState: "ready",
      uncertaintyScore: 0.3,
      facts: [],
      pageUrl: "http://localhost:3000/dashboard"
    },
    limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString()
  };

  const task: AgentTask = {
    id: "t-1",
    type: "open_page",
    status: "done",
    retries: 0,
    attempts: 1,
    replanDepth: 0,
    payload: { url: "http://localhost:3000/dashboard" }
  };

  const obs = makeObservation("run-state-test", "t-1");
  obs.pageUrl = "http://localhost:3000/login";

  const result = await verifyStateResult(ctx, task, obs);
  assert.equal(result.passed, false);
  assert.match(result.rationale, /diverges/i);
});

test("decideNextStep returns abort when retries exhausted and no replan budget", async () => {
  const { decideNextStep } = await import("../cognition/executive-controller");

  const result = decideNextStep({
    task: {
      id: "t-1",
      type: "click",
      status: "failed",
      retries: 2,
      attempts: 3,
      replanDepth: 0,
      payload: {}
    },
    stateVerification: {
      runId: "run-test",
      taskId: "t-1",
      verifier: "state",
      passed: false,
      confidence: 0.95,
      rationale: "Task failed",
      evidence: []
    },
    replanCount: 3,
    maxReplans: 3
  });

  assert.equal(result.nextAction, "abort");
});
