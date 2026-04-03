import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAction,
  classifyState,
  abstractPatterns,
  findAbstractPath
} from "./pattern-abstractor";

test("classifyAction: login button → auth-trigger", () => {
  assert.equal(classifyAction("click", "#login-btn"), "auth-trigger");
});

test("classifyAction: sign in link → auth-trigger", () => {
  assert.equal(classifyAction("click", "Sign In"), "auth-trigger");
});

test("classifyAction: open_page → navigation", () => {
  assert.equal(classifyAction("open_page", "/dashboard"), "navigation");
});

test("classifyAction: type → data-entry", () => {
  assert.equal(classifyAction("type", "#email"), "data-entry");
});

test("classifyAction: submit button → form-submit", () => {
  assert.equal(classifyAction("click", "#submit-form"), "form-submit");
});

test("classifyAction: unknown selector → interaction", () => {
  assert.equal(classifyAction("click", "#random-element"), "interaction");
});

test("classifyState: dashboard → authenticated", () => {
  assert.equal(classifyState("content:dashboard"), "authenticated");
});

test("classifyState: login page → unauthenticated", () => {
  assert.equal(classifyState("page:/login|content:login"), "unauthenticated");
});

test("classifyState: error → error", () => {
  assert.equal(classifyState("content:error|page:/500"), "error");
});

test("classifyState: loading → loading", () => {
  assert.equal(classifyState("app:loading"), "loading");
});

test("abstractPatterns: groups similar edges", () => {
  const edges = [
    { id: "e1", fromState: "page:/login", toState: "content:dashboard", action: "click", actionDetail: "#login-btn", confidence: 1.0 },
    { id: "e2", fromState: "content:sign-in", toState: "page:/home|content:welcome", action: "click", actionDetail: "Sign In", confidence: 0.9 }
  ];
  const patterns = abstractPatterns(edges);
  // Both should map to auth-trigger: unauthenticated → authenticated
  const authPattern = patterns.find(p => p.actionCategory === "auth-trigger");
  assert.ok(authPattern, "Should find auth-trigger pattern");
  assert.equal(authPattern!.sourceCount, 2);
});

test("abstractPatterns: confidence averages across sources", () => {
  const edges = [
    { id: "e1", fromState: "login", toState: "dashboard", action: "click", actionDetail: "#login", confidence: 1.0 },
    { id: "e2", fromState: "sign-in", toState: "welcome", action: "click", actionDetail: "#sign-in", confidence: 0.5 }
  ];
  const patterns = abstractPatterns(edges);
  const p = patterns.find(p => p.actionCategory === "auth-trigger");
  assert.ok(p);
  assert.ok(p!.confidence > 0.5 && p!.confidence < 1.0);
});

test("findAbstractPath: direct match", () => {
  const patterns = [
    { id: "p1", actionCategory: "auth-trigger", fromStateCategory: "unauthenticated", toStateCategory: "authenticated", confidence: 0.9, sourceCount: 5, examples: [] }
  ];
  const result = findAbstractPath(patterns, "unauthenticated", "authenticated");
  assert.equal(result.length, 1);
  assert.equal(result[0].actionCategory, "auth-trigger");
});

test("findAbstractPath: two-hop path", () => {
  const patterns = [
    { id: "p1", actionCategory: "navigation", fromStateCategory: "unknown", toStateCategory: "unauthenticated", confidence: 0.9, sourceCount: 3, examples: [] },
    { id: "p2", actionCategory: "auth-trigger", fromStateCategory: "unauthenticated", toStateCategory: "authenticated", confidence: 0.8, sourceCount: 5, examples: [] }
  ];
  const result = findAbstractPath(patterns, "unknown", "authenticated");
  assert.ok(result.length >= 1);
  assert.ok(result[0].confidence > 0.5);
});

test("findAbstractPath: empty when no path exists", () => {
  const patterns = [
    { id: "p1", actionCategory: "auth-trigger", fromStateCategory: "unauthenticated", toStateCategory: "authenticated", confidence: 0.9, sourceCount: 5, examples: [] }
  ];
  const result = findAbstractPath(patterns, "error", "content-listing");
  assert.equal(result.length, 0);
});
