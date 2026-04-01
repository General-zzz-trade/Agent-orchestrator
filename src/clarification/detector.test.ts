import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAmbiguity } from "./detector";

test("clear goal with URL: not ambiguous", () => {
  assert.equal(detectAmbiguity('open http://example.com and click "Login"').needed, false);
});

test("very short goal: ambiguous", () => {
  const r = detectAmbiguity("help me");
  assert.equal(r.needed, true);
  assert.ok(r.question);
});

test("goal with URL only: not ambiguous", () => {
  assert.equal(detectAmbiguity("go to https://google.com").needed, false);
});

test("no actionable keywords short goal: ambiguous", () => {
  assert.equal(detectAmbiguity("order management").needed, true);
});

test("detailed goal with multiple actions: not ambiguous", () => {
  assert.equal(detectAmbiguity('open http://localhost:3000 and type "admin" into "#user" and click "#login"').needed, false);
});

test("vague word 'something': ambiguous", () => {
  assert.equal(detectAmbiguity("do something with the user data").needed, true);
});

test("goal with 'stuff': ambiguous", () => {
  assert.equal(detectAmbiguity("process all the stuff in the database").needed, true);
});

test("screenshot goal: not ambiguous", () => {
  assert.equal(detectAmbiguity("take a screenshot of http://example.com").needed, false);
});
