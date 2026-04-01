import { test } from "node:test";
import assert from "node:assert/strict";
import { decomposeGoal, summarizeDecomposition } from "./index";

test("single step goal: not decomposed", () => {
  const r = decomposeGoal('open http://example.com and click "Login"');
  assert.equal(r.decomposed, false);
  assert.equal(r.subGoals.length, 1);
  assert.equal(r.strategy, "single");
});

test("two steps with 'then': decomposed", () => {
  const r = decomposeGoal("open http://example.com then click the login button");
  assert.equal(r.decomposed, true);
  assert.equal(r.subGoals.length, 2);
  assert.equal(r.strategy, "sequential");
});

test("three steps: correct dependency chain", () => {
  const r = decomposeGoal("open the app then fill the form then submit");
  assert.equal(r.subGoals.length, 3);
  assert.deepEqual(r.subGoals[0].dependsOn, []);
  assert.deepEqual(r.subGoals[1].dependsOn, [0]);
  assert.deepEqual(r.subGoals[2].dependsOn, [1]);
});

test("'after that' separator: decomposed", () => {
  const r = decomposeGoal("click login after that fill the username field");
  assert.equal(r.decomposed, true);
  assert.equal(r.subGoals.length, 2);
});

test("summarizeDecomposition: single goal passthrough", () => {
  const r = decomposeGoal("open http://example.com");
  assert.equal(summarizeDecomposition(r), "open http://example.com");
});

test("summarizeDecomposition: multi-step includes Step labels", () => {
  const r = decomposeGoal("open the app then click login");
  const summary = summarizeDecomposition(r);
  assert.ok(summary.includes("Step 1"));
  assert.ok(summary.includes("Step 2"));
});
