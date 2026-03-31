import test from "node:test";
import assert from "node:assert/strict";
import { planTasks } from "./planner";

test("planner returns AgentTask entries with metadata and auto stop_app", async () => {
  const result = await planTasks(
    'start app "npm run dev" and wait for server "http://localhost:3000" and open page "http://localhost:3000" and click "text=Login" and assert text "Dashboard" and screenshot'
    ,
    { runId: "test-run" }
  );
  const { tasks } = result;

  assert.equal(tasks.length, 7);
  assert.equal(result.plannerUsed, "template");
  assert.equal(result.qualitySummary.quality, "high");
  assert.equal(result.decisionTrace.chosenPlanner, "template");
  assert.match(tasks[0].id, /^test-run-\d{3}-start_app$/);
  assert.equal(tasks[0].status, "pending");
  assert.equal(tasks[0].retries, 0);
  assert.equal(tasks[0].type, "start_app");
  assert.equal(tasks[0].payload.command, "npm run dev");
  assert.equal(tasks[1].type, "wait_for_server");
  assert.equal(tasks[2].type, "open_page");
  assert.equal(tasks[3].type, "click");
  assert.equal(tasks[4].type, "assert_text");
  assert.equal(tasks[5].type, "screenshot");
  assert.equal(tasks[6].type, "stop_app");
});

test("planner appends stop_app when start_app exists without explicit stop", async () => {
  const result = await planTasks('start app "npm run dev" and wait for server "http://localhost:3000"', {
    runId: "test-run-2"
  });
  const { tasks } = result;

  assert.equal(tasks.at(-1)?.type, "stop_app");
  assert.ok(result.qualitySummary.score >= 60);
});

test("planner records fallback when template quality is not enough", async () => {
  const result = await planTasks('open "https://example.com" and click "#login-button"', {
    runId: "test-run-3"
  });

  assert.equal(result.plannerUsed, "regex");
  assert.ok(result.decisionTrace.candidatePlanners.length >= 2);
  assert.equal(result.decisionTrace.candidatePlanners[0]?.planner, "template");
  assert.equal(result.decisionTrace.candidatePlanners[1]?.planner, "regex");
  assert.ok(typeof result.fallbackReason === "string");
});
