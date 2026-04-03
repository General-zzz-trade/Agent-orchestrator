import test from "node:test";
import assert from "node:assert/strict";
import { causalDecompose, inferGoalState, inferCurrentState } from "./causal-decomposer";
import { createCausalGraph, addStateNode, addCausalEdge } from "../world-model/causal-graph";

test("causalDecompose: finds path through causal graph", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "content:login", "example.com");
  addStateNode(graph, "app:authenticated", "example.com");
  addStateNode(graph, "content:dashboard", "example.com");

  addCausalEdge(graph, "content:login", "app:authenticated", "click", "#login-btn", "example.com", true);
  addCausalEdge(graph, "app:authenticated", "content:dashboard", "open_page", "/dashboard", "example.com", true);

  const result = causalDecompose(
    "get to dashboard",
    "content:login",
    "content:dashboard",
    graph
  );

  assert.equal(result.decomposed, true);
  assert.equal(result.strategy, "causal");
  assert.equal(result.subGoals.length, 2);
  assert.ok(result.subGoals[0].goal.includes("click"));
  assert.ok(result.subGoals[1].goal.includes("open_page"));
});

test("causalDecompose: returns single goal when no path exists", () => {
  const graph = createCausalGraph();

  const result = causalDecompose(
    "do something unknown",
    "state:unknown",
    "state:other",
    graph
  );

  assert.equal(result.decomposed, false);
  assert.equal(result.strategy, "single");
  assert.equal(result.subGoals.length, 1);
});

test("causalDecompose: uses preconditions when no direct path", () => {
  const graph = createCausalGraph();
  // Only edges TO the goal, no full path from current
  addCausalEdge(graph, "app:authenticated", "content:dashboard", "open_page", "/dashboard", "d", true);
  addCausalEdge(graph, "content:login", "content:dashboard", "click", "#login-submit", "d", true);

  const result = causalDecompose(
    "open dashboard",
    "state:initial",  // no path from here
    "content:dashboard",
    graph
  );

  // Should find preconditions (edges leading to content:dashboard)
  assert.equal(result.decomposed, true);
  assert.ok(result.subGoals.length >= 2); // preconditions + original goal
});

test("causalDecompose: dependency chain is correct", () => {
  const graph = createCausalGraph();
  addCausalEdge(graph, "A", "B", "step1", "", "d", true);
  addCausalEdge(graph, "B", "C", "step2", "", "d", true);
  addCausalEdge(graph, "C", "D", "step3", "", "d", true);

  const result = causalDecompose("reach D", "A", "D", graph);
  assert.equal(result.subGoals.length, 3);
  assert.deepEqual(result.subGoals[0].dependsOn, []);
  assert.deepEqual(result.subGoals[1].dependsOn, [0]);
  assert.deepEqual(result.subGoals[2].dependsOn, [1]);
});

test("inferGoalState: maps dashboard goal", () => {
  assert.equal(inferGoalState("open the dashboard"), "content:dashboard");
});

test("inferGoalState: maps login goal", () => {
  assert.equal(inferGoalState("go to login page"), "content:login");
});

test("inferGoalState: maps authenticated goal", () => {
  assert.equal(inferGoalState("ensure user is authenticated"), "app:authenticated");
});

test("inferGoalState: generic goal", () => {
  const state = inferGoalState("do something specific");
  assert.ok(state.startsWith("goal:"));
});

test("inferCurrentState: extracts from page URL and app state", () => {
  const state = inferCurrentState({
    pageUrl: "http://localhost:3000/login",
    appState: "ready",
    visibleText: ["Sign in to continue"]
  });
  assert.ok(state.includes("page:/login"));
  assert.ok(state.includes("app:ready"));
  assert.ok(state.includes("content:login"));
});

test("inferCurrentState: returns unknown for empty input", () => {
  assert.equal(inferCurrentState({}), "state:unknown");
});
