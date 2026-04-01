import { test } from "node:test";
import assert from "node:assert/strict";
import { storeClarification, getClarification, answerClarification, hasPendingClarification, deleteClarification } from "./store";

test("store + get roundtrip", () => {
  storeClarification({ runId: "r1", originalGoal: "do stuff", question: "What stuff?", askedAt: new Date().toISOString() });
  assert.equal(getClarification("r1")?.question, "What stuff?");
  deleteClarification("r1");
});

test("hasPendingClarification: true when unanswered", () => {
  storeClarification({ runId: "r2", originalGoal: "x", question: "Q?", askedAt: new Date().toISOString() });
  assert.equal(hasPendingClarification("r2"), true);
  deleteClarification("r2");
});

test("answerClarification: sets answer", () => {
  storeClarification({ runId: "r3", originalGoal: "x", question: "Q?", askedAt: new Date().toISOString() });
  const r = answerClarification("r3", "login to dashboard");
  assert.equal(r?.answer, "login to dashboard");
  assert.ok(r?.answeredAt);
  deleteClarification("r3");
});

test("hasPendingClarification: false after answer", () => {
  storeClarification({ runId: "r4", originalGoal: "x", question: "Q?", askedAt: new Date().toISOString() });
  answerClarification("r4", "answer");
  assert.equal(hasPendingClarification("r4"), false);
  deleteClarification("r4");
});

test("answerClarification: undefined for unknown runId", () => {
  assert.equal(answerClarification("nonexistent", "answer"), undefined);
});
