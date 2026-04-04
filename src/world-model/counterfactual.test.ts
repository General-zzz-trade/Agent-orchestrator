import test from "node:test";
import assert from "node:assert/strict";
import { createCausalGraph, addStateNode, addCausalEdge } from "./causal-graph";
import {
  interventionalQuery,
  counterfactualQuery,
  suggestAlternativeActions
} from "./counterfactual";

function buildTestGraph() {
  const graph = createCausalGraph();

  addStateNode(graph, "page:login", "example.com");
  addStateNode(graph, "page:dashboard", "example.com");
  addStateNode(graph, "error:click", "example.com");
  addStateNode(graph, "page:settings", "example.com");

  // click #login-button: login -> dashboard (3 successes, 1 failure)
  addCausalEdge(graph, "page:login", "page:dashboard", "click", "#login-button", "example.com", true);
  addCausalEdge(graph, "page:login", "page:dashboard", "click", "#login-button", "example.com", true);
  addCausalEdge(graph, "page:login", "page:dashboard", "click", "#login-button", "example.com", true);
  addCausalEdge(graph, "page:login", "error:click", "click", "#login-button", "example.com", false);

  // type #username: login -> login (always succeeds, stays on same page)
  addCausalEdge(graph, "page:login", "page:login", "type", "#username", "example.com", true);
  addCausalEdge(graph, "page:login", "page:login", "type", "#username", "example.com", true);

  // click #settings: dashboard -> settings (high confidence)
  addCausalEdge(graph, "page:dashboard", "page:settings", "click", "#settings-link", "example.com", true);
  addCausalEdge(graph, "page:dashboard", "page:settings", "click", "#settings-link", "example.com", true);
  addCausalEdge(graph, "page:dashboard", "page:settings", "click", "#settings-link", "example.com", true);

  // click #broken: dashboard -> error (low confidence)
  addCausalEdge(graph, "page:dashboard", "error:click", "click", "#broken-link", "example.com", false);
  addCausalEdge(graph, "page:dashboard", "error:click", "click", "#broken-link", "example.com", false);
  addCausalEdge(graph, "page:dashboard", "error:click", "click", "#broken-link", "example.com", true);

  return graph;
}

test("interventionalQuery returns predicted states", () => {
  const graph = buildTestGraph();
  const result = interventionalQuery(graph, "page:login", "click");
  assert.ok(result.predictedStates.length > 0, "Should predict at least one state");
  assert.ok(result.totalEvidence > 0, "Should have evidence");

  // dashboard should be predicted with higher probability than error
  const dashboardPred = result.predictedStates.find(s => s.state === "page:dashboard");
  assert.ok(dashboardPred, "Should predict dashboard state");
  assert.ok(dashboardPred!.probability > 0, "Dashboard probability should be > 0");
});

test("interventionalQuery returns empty for unknown action", () => {
  const graph = buildTestGraph();
  const result = interventionalQuery(graph, "page:login", "scroll");
  assert.equal(result.predictedStates.length, 0);
  assert.equal(result.totalEvidence, 0);
});

test("counterfactualQuery compares alternative actions", () => {
  const graph = buildTestGraph();
  const result = counterfactualQuery(graph, {
    observedState: "page:login",
    observedAction: "click",
    observedOutcome: "error:click",
    hypotheticalAction: "type"
  });

  assert.equal(result.query.hypotheticalAction, "type");
  assert.ok(result.confidence > 0, "Should have some confidence");
  assert.ok(result.reasoning.length > 0, "Should have reasoning");
  assert.notEqual(result.predictedOutcome, "unknown");
});

test("counterfactualQuery returns low confidence for unknown hypothetical", () => {
  const graph = buildTestGraph();
  const result = counterfactualQuery(graph, {
    observedState: "page:login",
    observedAction: "click",
    observedOutcome: "page:dashboard",
    hypotheticalAction: "scroll"
  });
  assert.equal(result.predictedOutcome, "unknown");
  assert.equal(result.confidence, 0.1);
});

test("suggestAlternativeActions returns sorted alternatives", () => {
  const graph = buildTestGraph();
  // From dashboard, "click #broken-link" failed — suggest alternatives
  const alternatives = suggestAlternativeActions(graph, "page:dashboard", "click");
  // There are no non-click actions from dashboard, so should be empty
  assert.equal(alternatives.length, 0);

  // From login, "type" failed — suggest alternatives
  const alts2 = suggestAlternativeActions(graph, "page:login", "type");
  assert.ok(alts2.length > 0, "Should suggest click as alternative");
  // Should be sorted by success probability descending
  for (let i = 1; i < alts2.length; i++) {
    assert.ok(
      alts2[i - 1].successProbability >= alts2[i].successProbability,
      "Alternatives should be sorted by successProbability descending"
    );
  }
});
