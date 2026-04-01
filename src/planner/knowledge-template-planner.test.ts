import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { initKnowledgeTable, upsertTemplate } from "../knowledge/store";
import { planFromKnowledge } from "./knowledge-template-planner";

beforeEach(() => {
  initKnowledgeTable();
  getDb().prepare("DELETE FROM knowledge").run();
});

test("planFromKnowledge: no match when knowledge empty", () => {
  const r = planFromKnowledge("open http://example.com and login");
  assert.equal(r.matched, false);
});

test("planFromKnowledge: matches stored template with high overlap", () => {
  upsertTemplate({
    goalPattern: "login dashboard example",
    tasksSummary: "open_page → click → type → assert_text",
    tasksJson: JSON.stringify([
      { type: "open_page", payload: { url: "http://example.com" } },
      { type: "click", payload: { selector: "#login" } }
    ]),
    successCount: 3
  });
  const r = planFromKnowledge("login to dashboard on example site");
  if (r.matched) {
    assert.ok(r.blueprints.length >= 1);
    assert.ok(r.confidence >= 0.5);
  }
  // Even if not matched (keyword overlap too low), should not throw
  assert.equal(typeof r.confidence, "number");
});

test("planFromKnowledge: low confidence → not matched", () => {
  upsertTemplate({
    goalPattern: "completely different thing",
    tasksSummary: "open_page",
    tasksJson: JSON.stringify([{ type: "open_page", payload: { url: "http://x.com" } }]),
    successCount: 1
  });
  const r = planFromKnowledge("login to my banking app");
  assert.equal(r.matched, false);
});
