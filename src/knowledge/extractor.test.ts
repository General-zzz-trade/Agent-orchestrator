import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { initKnowledgeTable, getKnowledgeStats, getSelectorsForDomain, getLessonsForTaskType } from "./store";
import { extractKnowledgeFromRun } from "./extractor";
import type { RunContext, AgentTask } from "../types";

function makeTask(overrides: Partial<AgentTask>): AgentTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 6)}`,
    type: "click",
    status: "done",
    retries: 0,
    attempts: 1,
    replanDepth: 0,
    payload: {},
    ...overrides
  } as AgentTask;
}

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: `run-${Math.random().toString(36).slice(2, 8)}`,
    goal: "open http://localhost:3000 and click login",
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
    result: { success: true, message: "done" },
    plannerDecisionTrace: {
      qualitySummary: { complete: true, score: 90, quality: "high", issues: [] }
    } as unknown as RunContext["plannerDecisionTrace"],
    ...overrides
  } as unknown as RunContext;
}

beforeEach(() => {
  initKnowledgeTable();
  getDb().prepare("DELETE FROM knowledge").run();
});

test("extractKnowledgeFromRun: stores successful selectors from done tasks", () => {
  const ctx = makeContext({
    tasks: [
      makeTask({ type: "open_page", payload: { url: "http://localhost:3000/app" } }),
      makeTask({ type: "click", payload: { selector: "#login-btn" }, status: "done" }),
      makeTask({ type: "type", payload: { selector: "#email", text: "user@test.com" }, status: "done" })
    ]
  });

  extractKnowledgeFromRun(ctx);

  const selectors = getSelectorsForDomain("localhost:3000");
  assert.ok(selectors.length >= 2, `Expected >= 2 selectors, got ${selectors.length}`);
  assert.ok(selectors.some(s => s.selector === "#login-btn"));
  assert.ok(selectors.some(s => s.selector === "#email"));
});

test("extractKnowledgeFromRun: stores failure lessons from failed tasks", () => {
  const failedClickTask = makeTask({
    id: "task-click-failed",
    type: "click",
    payload: { selector: "#missing" },
    status: "failed",
    errorHistory: ["element not found in the DOM after 30000ms"]
  });
  const ctx = makeContext({
    tasks: [
      makeTask({ type: "open_page", payload: { url: "http://localhost:3000/" } }),
      failedClickTask,
      makeTask({ type: "visual_click", payload: { description: "element with id missing" }, status: "done", replanDepth: 1 })
    ],
    hypotheses: [
      {
        id: "hyp-1",
        taskId: "task-click-failed",
        kind: "selector_drift",
        explanation: "Selector likely drifted.",
        confidence: 0.91,
        belief: { alpha: 2, beta: 1 },
        suggestedExperiments: ["check selector presence"],
        recoveryHint: "Prefer visual fallback."
      }
    ],
    experimentResults: [
      {
        id: "exp-1",
        runId: "run-failure-lesson",
        taskId: "task-click-failed",
        hypothesisId: "hyp-1",
        experiment: "check selector presence in DOM",
        performedAction: "probe selector count in DOM",
        outcome: "support",
        evidence: ["selector=#missing", "count=0"],
        confidenceDelta: 0.18,
        stateHints: ["experiment:selector_count:0"]
      }
    ],
    worldStateHistory: [
      {
        runId: "run-failure-lesson",
        timestamp: new Date().toISOString(),
        source: "task_observe",
        reason: "failure_observation",
        appState: "ready",
        lastAction: "click",
        uncertaintyScore: 0.4,
        facts: []
      },
      {
        runId: "run-failure-lesson",
        timestamp: new Date().toISOString(),
        source: "experiment_refresh",
        reason: "check selector presence in DOM",
        appState: "ready",
        lastAction: "click",
        uncertaintyScore: 0.25,
        facts: []
      }
    ],
    result: { success: false, message: "failed" }
  });

  extractKnowledgeFromRun(ctx);

  const lessons = getLessonsForTaskType("click");
  assert.ok(lessons.length >= 1, `Expected >= 1 lesson, got ${lessons.length}`);
  assert.ok(lessons[0].errorPattern.includes("element not found"));
  assert.equal(lessons[0].hypothesisKind, "selector_drift");
  assert.ok(lessons[0].stateTransition?.includes("ready"));
  assert.ok(lessons[0].recoverySequence?.includes("use visual_click"));
});

test("extractKnowledgeFromRun: stores task template on high-quality success", () => {
  const ctx = makeContext({
    goal: "open login page and submit form",
    tasks: [
      makeTask({ type: "open_page", payload: { url: "http://localhost:3000/login" } }),
      makeTask({ type: "click", payload: { selector: "#submit" }, status: "done" })
    ],
    result: { success: true, message: "ok" }
  });

  extractKnowledgeFromRun(ctx);

  const stats = getKnowledgeStats();
  assert.equal(stats.templates, 1);
});

test("extractKnowledgeFromRun: skips template for failed run", () => {
  const ctx = makeContext({
    tasks: [
      makeTask({ type: "open_page", payload: { url: "http://localhost:3000/" } }),
      makeTask({ type: "click", payload: { selector: "#btn" }, status: "done" })
    ],
    result: { success: false, message: "failed" }
  });

  extractKnowledgeFromRun(ctx);

  const stats = getKnowledgeStats();
  assert.equal(stats.templates, 0);
});

test("extractKnowledgeFromRun: skips template for low-quality plan", () => {
  const ctx = makeContext({
    tasks: [
      makeTask({ type: "open_page", payload: { url: "http://localhost:3000/" } }),
      makeTask({ type: "click", payload: { selector: "#btn" }, status: "done" })
    ],
    result: { success: true, message: "ok" },
    plannerDecisionTrace: {
      qualitySummary: { complete: true, score: 50, quality: "low", issues: [] }
    } as unknown as RunContext["plannerDecisionTrace"]
  });

  extractKnowledgeFromRun(ctx);

  const stats = getKnowledgeStats();
  assert.equal(stats.templates, 0);
});

test("extractKnowledgeFromRun: does not throw on empty context", () => {
  const ctx = makeContext({ tasks: [], result: { success: false, message: "no tasks" } });
  assert.doesNotThrow(() => extractKnowledgeFromRun(ctx));
});
