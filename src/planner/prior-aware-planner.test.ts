import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/client";
import { initKnowledgeTable, upsertLesson } from "../knowledge/store";
import { applyPlanningPriors } from "./prior-aware-planner";

beforeEach(() => {
  initKnowledgeTable();
  getDb().prepare("DELETE FROM knowledge").run();
});

test("applyPlanningPriors: inserts visual_click for natural language click when prior exists", () => {
  upsertLesson({
    taskType: "click",
    errorPattern: "selector moved",
    recovery: "use visual_click",
    domain: "example.com",
    successCount: 2,
    hypothesisKind: "selector_drift",
    recoverySequence: ["use visual_click"]
  });

  const result = applyPlanningPriors('open "https://example.com" and click login', [
    { type: "open_page", payload: { url: "https://example.com" } }
  ]);

  assert.equal(result.blueprints[1]?.type, "visual_click");
  assert.equal(result.blueprints[1]?.payload.description, "login");
  assert.ok(result.notes.some((note) => note.includes("visual_click")));
});

test("applyPlanningPriors: inserts wait before assert_text when prior recommends it", () => {
  upsertLesson({
    taskType: "assert_text",
    errorPattern: "dashboard delayed",
    recovery: "add wait 1500ms",
    successCount: 2,
    hypothesisKind: "state_not_ready",
    recoverySequence: ["add wait 1500ms", "retry assertion"]
  });

  const result = applyPlanningPriors('open "https://example.com" and assert text "Dashboard"', [
    { type: "open_page", payload: { url: "https://example.com" } },
    { type: "assert_text", payload: { text: "Dashboard", timeoutMs: 5000 } }
  ]);

  assert.equal(result.blueprints[1]?.type, "wait");
  assert.equal(result.blueprints[1]?.payload.durationMs, 1500);
  assert.equal(result.blueprints[2]?.type, "assert_text");
});
