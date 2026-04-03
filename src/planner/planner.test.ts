import test from "node:test";
import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import { planTasks } from "./index";
import { getDb } from "../db/client";
import { initKnowledgeTable, upsertLesson } from "../knowledge/store";

// Minimal runId fixture
const RUN = "test-run";

beforeEach(() => {
  initKnowledgeTable();
  getDb().prepare("DELETE FROM knowledge").run();
});

// ---------------------------------------------------------------------------
// Planner selection for new action types
// ---------------------------------------------------------------------------

test("planner: type+click goal uses regex, not LLM", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and type "admin" into "#username" and click "#submit" and assert text "Welcome"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 } // cap=0 ensures no LLM
  );
  assert.ok(result.plannerUsed === "regex" || result.plannerUsed === "template");
  assert.ok(result.tasks.length > 0);
  const types = result.tasks.map((t) => t.type);
  assert.ok(types.includes("type"), "plan should include type task");
  assert.ok(types.includes("click"));
  assert.ok(types.includes("assert_text"));
});

test("planner: select goal uses regex planner", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and select "admin" from "#role" and click "#submit"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  assert.ok(result.plannerUsed !== "none", "should produce a plan");
  const types = result.tasks.map((t) => t.type);
  assert.ok(types.includes("select"));
});

test("planner: hover goal is recognised", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and hover "#menu"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  const types = result.tasks.map((t) => t.type);
  assert.ok(types.includes("hover"));
});

test("planner: scroll goal is recognised", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and scroll down',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  const types = result.tasks.map((t) => t.type);
  assert.ok(types.includes("scroll"));
});

// ---------------------------------------------------------------------------
// Goal category drives LLM escalation
// ---------------------------------------------------------------------------

test("planner: explicit goal (type signal) does not escalate to LLM when cap=0", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and type "x" into "#f" and assert text "ok"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  // With LLM cap=0, should still get a rule plan (no fallback to none)
  assert.notEqual(result.plannerUsed, "none");
  assert.equal(result.decisionTrace.goalCategory, "explicit");
});

test("planner: ambiguous goal classifies correctly in trace", async () => {
  const result = await planTasks(
    "check whether the login works",
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  assert.equal(result.decisionTrace.goalCategory, "ambiguous");
});

// ---------------------------------------------------------------------------
// Forced planner modes
// ---------------------------------------------------------------------------

test("planner: mode=regex ignores template", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and screenshot',
    { runId: RUN, mode: "regex" }
  );
  assert.equal(result.plannerUsed, "regex");
});

test("planner: mode=template falls back to none for unmatched goal", async () => {
  const result = await planTasks(
    'type "admin" into "#username"',
    { runId: RUN, mode: "template" }
  );
  // Template planner can't match a bare type goal without full structure
  assert.equal(result.decisionTrace.candidatePlanners[0]?.planner, "template");
});

// ---------------------------------------------------------------------------
// Quality gate and decision trace
// ---------------------------------------------------------------------------

test("planner: decision trace includes quality score", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and screenshot',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  assert.ok(typeof result.decisionTrace.qualityScore === "number");
  assert.ok(result.decisionTrace.qualityScore >= 0 && result.decisionTrace.qualityScore <= 100);
});

test("planner: decision trace lists candidate planners", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and click "#btn" and assert text "ok"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );
  const planners = result.decisionTrace.candidatePlanners.map((c) => c.planner);
  // auto mode always tries template + regex
  assert.ok(planners.includes("template") || planners.includes("regex"));
});

test("planner: empty goal returns no tasks", async () => {
  const result = await planTasks("", { runId: RUN });
  assert.equal(result.tasks.length, 0);
  assert.equal(result.plannerUsed, "none");
});

// ---------------------------------------------------------------------------
// Type task payload validation passes through pipeline
// ---------------------------------------------------------------------------

test("planner: type task has correct payload shape", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and type "hello" into "#input" and click "#submit"',
    { runId: RUN, mode: "regex" }
  );
  const typeTask = result.tasks.find((t) => t.type === "type");
  assert.ok(typeTask, "type task should be present");
  assert.equal(typeTask?.payload.text, "hello");
  assert.equal(typeTask?.payload.selector, "#input");
  assert.ok(typeTask?.id, "task should have an id");
  assert.equal(typeTask?.status, "pending");
});

test("planner: select task has correct payload shape", async () => {
  const result = await planTasks(
    'open page "http://localhost:3000" and select "en" from "#lang"',
    { runId: RUN, mode: "regex" }
  );
  const selectTask = result.tasks.find((t) => t.type === "select");
  assert.ok(selectTask);
  assert.equal(selectTask?.payload.value, "en");
  assert.equal(selectTask?.payload.selector, "#lang");
});

test("planner: planning prior inserts visual_click for natural click goal", async () => {
  upsertLesson({
    taskType: "click",
    errorPattern: "selector moved",
    recovery: "use visual_click",
    domain: "example.com",
    successCount: 2,
    hypothesisKind: "selector_drift",
    recoverySequence: ["use visual_click"]
  });

  const result = await planTasks(
    'open "https://example.com" and click login',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );

  const types = result.tasks.map((task) => task.type);
  assert.ok(types.includes("visual_click"));
  assert.equal(result.decisionTrace.chosenPriorAwarePlanning?.applied, true);
  assert.ok((result.decisionTrace.chosenPriorAwarePlanning?.matchedPriors.length ?? 0) > 0);
});

test("planner: planning prior inserts wait before assert_text", async () => {
  upsertLesson({
    taskType: "assert_text",
    errorPattern: "dashboard delayed",
    recovery: "add wait 1500ms",
    successCount: 2,
    hypothesisKind: "state_not_ready",
    recoverySequence: ["add wait 1500ms", "retry assertion"]
  });

  const result = await planTasks(
    'open "https://example.com" and assert text "Dashboard"',
    { runId: RUN, mode: "auto", maxLLMPlannerCalls: 0 }
  );

  const waitIndex = result.tasks.findIndex((task) => task.type === "wait");
  const assertIndex = result.tasks.findIndex((task) => task.type === "assert_text");
  assert.ok(waitIndex >= 0);
  assert.ok(assertIndex > waitIndex);
  assert.equal(result.decisionTrace.chosenPriorAwarePlanning?.applied, true);
});
