import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { initKnowledgeTable, upsertSelector, upsertLesson, upsertTemplate } from "./store";
import { buildKnowledgeContext, buildPlanningPriors, extractDomainFromGoal, inferLikelyTaskTypes } from "./planner-context";

beforeEach(() => {
  initKnowledgeTable();
  getDb().prepare("DELETE FROM knowledge").run();
});

test("buildKnowledgeContext: empty when no knowledge", () => {
  const ctx = buildKnowledgeContext("open http://example.com and click login");
  assert.equal(ctx, "");
});

test("buildKnowledgeContext: includes selectors when available", () => {
  upsertSelector({ domain: "example.com", description: "login button", selector: "#login", successCount: 5, failureCount: 0 });
  const ctx = buildKnowledgeContext("open http://example.com and click login", "example.com");
  assert.ok(ctx.includes("#login"));
  assert.ok(ctx.includes("login button"));
});

test("buildKnowledgeContext: includes failure lessons", () => {
  upsertLesson({
    taskType: "click",
    errorPattern: "element not found",
    recovery: "use visual_click",
    successCount: 3,
    hypothesisKind: "selector_drift",
    stateTransition: "ready -> ready"
  });
  const ctx = buildKnowledgeContext("click something", undefined);
  assert.ok(ctx.includes("visual_click"));
  assert.ok(ctx.includes("selector_drift"));
  assert.ok(ctx.includes("ready -> ready"));
});

test("buildKnowledgeContext: includes procedural priors for likely task types", () => {
  upsertLesson({
    taskType: "click",
    errorPattern: "selector moved",
    recovery: "use visual_click",
    domain: "example.com",
    successCount: 3,
    hypothesisKind: "selector_drift",
    recoverySequence: ["use visual_click"]
  });

  const ctx = buildKnowledgeContext("open http://example.com and click login then verify dashboard", "example.com");
  assert.ok(ctx.includes("Procedural priors for likely task types:"));
  assert.ok(ctx.includes("click:"));
  assert.ok(ctx.includes("use visual_click"));
});

test("buildPlanningPriors: returns task-scoped procedural priors", () => {
  upsertLesson({
    taskType: "assert_text",
    errorPattern: "dashboard text drift",
    recovery: "retry assertion",
    successCount: 2,
    hypothesisKind: "assertion_phrase_changed",
    recoverySequence: ["add wait 1500ms", "retry assertion"]
  });

  const priors = buildPlanningPriors("confirm dashboard text appears");
  assert.equal(priors.length, 1);
  assert.equal(priors[0].taskType, "assert_text");
  assert.equal(priors[0].lessons[0]?.hypothesisKind, "assertion_phrase_changed");
});

test("inferLikelyTaskTypes: infers interactive task types from goal", () => {
  const taskTypes = inferLikelyTaskTypes("open app and click login then enter password and verify dashboard");
  assert.ok(taskTypes.includes("open_page"));
  assert.ok(taskTypes.includes("click"));
  assert.ok(taskTypes.includes("type"));
  assert.ok(taskTypes.includes("assert_text"));
});

test("extractDomainFromGoal: extracts host", () => {
  assert.equal(extractDomainFromGoal("open http://localhost:3000/app"), "localhost:3000");
});

test("extractDomainFromGoal: returns undefined for no URL", () => {
  assert.equal(extractDomainFromGoal("click the login button"), undefined);
});
