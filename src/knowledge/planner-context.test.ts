import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { initKnowledgeTable, upsertSelector, upsertLesson, upsertTemplate } from "./store";
import { buildKnowledgeContext, extractDomainFromGoal } from "./planner-context";

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
  upsertLesson({ taskType: "click", errorPattern: "element not found", recovery: "use visual_click", successCount: 3 });
  const ctx = buildKnowledgeContext("click something", undefined);
  assert.ok(ctx.includes("visual_click"));
});

test("extractDomainFromGoal: extracts host", () => {
  assert.equal(extractDomainFromGoal("open http://localhost:3000/app"), "localhost:3000");
});

test("extractDomainFromGoal: returns undefined for no URL", () => {
  assert.equal(extractDomainFromGoal("click the login button"), undefined);
});
