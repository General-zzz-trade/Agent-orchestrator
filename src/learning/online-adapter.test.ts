import test from "node:test";
import assert from "node:assert/strict";
import {
  createOnlineAdapterState,
  recordInRunFailure,
  suggestAdaptation,
  getRunTimeLearnings
} from "./online-adapter";
import type { AgentTask } from "../types";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1", type: "click", status: "failed",
    retries: 0, attempts: 1, replanDepth: 0,
    payload: { selector: "#btn" },
    ...overrides
  };
}

test("createOnlineAdapterState initializes empty", () => {
  const state = createOnlineAdapterState();
  assert.equal(state.lessons.length, 0);
  assert.equal(state.failedSelectors.size, 0);
  assert.equal(state.failedTaskTypes.size, 0);
});

test("recordInRunFailure tracks selector failure count", () => {
  const state = createOnlineAdapterState();
  recordInRunFailure(state, makeTask(), "not found", 0);
  assert.equal(state.failedSelectors.get("#btn"), 1);
  recordInRunFailure(state, makeTask(), "not found again", 1);
  assert.equal(state.failedSelectors.get("#btn"), 2);
});

test("recordInRunFailure tracks task type failure count", () => {
  const state = createOnlineAdapterState();
  recordInRunFailure(state, makeTask({ type: "click" }), "err", 0);
  recordInRunFailure(state, makeTask({ type: "click" }), "err", 1);
  assert.equal(state.failedTaskTypes.get("click"), 2);
});

test("suggestAdaptation: visual fallback after selector failure", () => {
  const state = createOnlineAdapterState();
  recordInRunFailure(state, makeTask({ payload: { selector: "#login" } }), "not found", 0);

  const suggestion = suggestAdaptation(state, makeTask({ type: "click", payload: { selector: "#login" } }));
  assert.ok(suggestion);
  assert.ok(suggestion!.strategy.includes("visual"));
});

test("suggestAdaptation: no suggestion for fresh selector", () => {
  const state = createOnlineAdapterState();
  const suggestion = suggestAdaptation(state, makeTask({ payload: { selector: "#new-btn" } }));
  assert.equal(suggestion, null);
});

test("suggestAdaptation: wait suggestion after 3 type failures", () => {
  const state = createOnlineAdapterState();
  for (let i = 0; i < 3; i++) {
    recordInRunFailure(state, makeTask({ id: `t${i}`, type: "assert_text", payload: { text: "x" } }), "timeout", i);
  }
  const suggestion = suggestAdaptation(state, makeTask({ type: "assert_text", payload: { text: "y" } }));
  assert.ok(suggestion);
  assert.ok(suggestion!.strategy.includes("wait"));
});

test("suggestAdaptation: type task gets visual_type suggestion", () => {
  const state = createOnlineAdapterState();
  recordInRunFailure(state, makeTask({ type: "type", payload: { selector: "#email" } }), "not found", 0);

  const suggestion = suggestAdaptation(state, makeTask({ type: "type", payload: { selector: "#email" } }));
  assert.ok(suggestion);
  assert.ok(suggestion!.strategy.includes("visual_type"));
});

test("getRunTimeLearnings: empty state", () => {
  const state = createOnlineAdapterState();
  const summary = getRunTimeLearnings(state);
  assert.ok(summary.includes("No in-run adaptations"));
});

test("getRunTimeLearnings: with lessons", () => {
  const state = createOnlineAdapterState();
  recordInRunFailure(state, makeTask(), "selector not found", 0);
  const summary = getRunTimeLearnings(state);
  assert.ok(summary.includes("In-run learnings"));
  assert.ok(summary.includes("#btn"));
});

test("recordInRunFailure returns lesson with suggested strategy", () => {
  const state = createOnlineAdapterState();
  const lesson = recordInRunFailure(state, makeTask({ type: "click" }), "not found", 0);
  assert.ok(lesson.suggestedStrategy.length > 0);
  assert.equal(lesson.taskType, "click");
  assert.equal(lesson.selector, "#btn");
});
