import test from "node:test";
import assert from "node:assert/strict";

import {
  selectPlannerThompson,
  recordPlannerOutcome,
  resetPlannerStats,
  getPlannerStats,
} from "../planner/thompson-sampling";

import { applyBeliefUpdates } from "../cognition/belief-updater";
import type { FailureHypothesis } from "../cognition/types";

import {
  encodeObservation,
  detectLoop,
  cosineSimilarity,
} from "../world-model/state-encoder";
import type { AgentObservation } from "../cognition/types";

import {
  getAdaptiveWeights,
  updateWeights,
  resetWeights,
} from "../learning/weight-optimizer";

import {
  createHTNPlan,
  decomposeNode,
  getNextExecutableNode,
  markNodeDone,
} from "../decomposer/htn-planner";

// ---------------------------------------------------------------------------
// Test 1: Thompson Sampling converges
// ---------------------------------------------------------------------------
test("Thompson Sampling converges toward better planner", () => {
  resetPlannerStats();
  const candidates = ["template", "llm"];
  const category = "login";

  // Record many successes for template, many failures for llm
  for (let i = 0; i < 20; i++) {
    recordPlannerOutcome("template", category, true, 10);
    recordPlannerOutcome("llm", category, false, 500);
  }

  // Sample many times; template should win the majority
  let templateWins = 0;
  for (let i = 0; i < 100; i++) {
    const result = selectPlannerThompson(candidates, category);
    if (result.selected === "template") templateWins++;
  }

  // Template should win at least 80% of the time
  assert.ok(
    templateWins >= 80,
    `Expected template to win >=80/100 but got ${templateWins}`
  );

  resetPlannerStats();
});

// ---------------------------------------------------------------------------
// Test 2: Belief updates with Beta distribution
// ---------------------------------------------------------------------------
test("Belief updater adjusts alpha/beta from experiment results", () => {
  const hypothesis: FailureHypothesis = {
    id: "h1",
    kind: "selector_drift",
    explanation: "Selector may have drifted",
    confidence: 0.67,
    belief: { alpha: 2, beta: 1 },
    suggestedExperiments: ["try_alt_selector"],
    recoveryHint: "Use parent selector",
  };

  const supportResult = {
    id: "exp1",
    runId: "run-1",
    hypothesisId: "h1",
    experiment: "try_alt_selector",
    outcome: "support" as const,
    evidence: ["Element found with alt selector"],
    confidenceDelta: 0.1,
  };

  const { updatedHypotheses, beliefUpdates } = applyBeliefUpdates({
    runId: "run-1",
    hypotheses: [hypothesis],
    experimentResults: [supportResult],
  });

  // Alpha should have increased (support increments alpha)
  assert.ok(
    updatedHypotheses[0].belief.alpha > hypothesis.belief.alpha,
    `Alpha should increase: was ${hypothesis.belief.alpha}, got ${updatedHypotheses[0].belief.alpha}`
  );
  // Beta should be unchanged
  assert.equal(updatedHypotheses[0].belief.beta, hypothesis.belief.beta);
  assert.equal(beliefUpdates.length, 1);
});

// ---------------------------------------------------------------------------
// Test 3: State encoder loop detection
// ---------------------------------------------------------------------------
test("State encoder detects loops from similar observations", () => {
  const makeObs = (url: string, text: string[]): AgentObservation => ({
    id: `obs-${Math.random().toString(36).slice(2)}`,
    runId: "run-1",
    timestamp: new Date().toISOString(),
    source: "task_observe",
    pageUrl: url,
    visibleText: text,
    appStateGuess: "ready",
    anomalies: [],
    confidence: 0.9,
  });

  // Encode the same observation multiple times
  const obs1 = makeObs("https://example.com/dashboard", ["Welcome", "Dashboard", "User: Alice"]);
  const obs2 = makeObs("https://example.com/dashboard", ["Welcome", "Dashboard", "User: Alice"]);
  const obs3 = makeObs("https://example.com/settings", ["Settings", "Account", "Privacy"]);

  const emb1 = encodeObservation(obs1);
  const emb2 = encodeObservation(obs2);
  const emb3 = encodeObservation(obs3);

  // Same observation should produce identical embedding
  assert.equal(cosineSimilarity(emb1, emb2), 1.0);

  // Different page should have lower similarity
  const crossSim = cosineSimilarity(emb1, emb3);
  assert.ok(crossSim < 0.99, `Cross-page similarity should be < 0.99, got ${crossSim}`);

  // Loop detection: identical states should trigger loop
  const loopResult = detectLoop(emb2, [emb1]);
  assert.equal(loopResult.isLoop, true);
  assert.equal(loopResult.matchIndex, 0);

  // Different state should not trigger loop
  const noLoop = detectLoop(emb3, [emb1]);
  // May or may not be a loop depending on threshold; at minimum similarity should be lower
  assert.ok(noLoop.similarity < loopResult.similarity);
});

// ---------------------------------------------------------------------------
// Test 4: Weight optimizer convergence
// ---------------------------------------------------------------------------
test("Weight optimizer adjusts weights based on feedback", () => {
  resetWeights();

  const initial = getAdaptiveWeights();
  const initialFamiliarity = initial.familiarityWeight;

  // Simulate: we predicted low confidence (0.3) but task succeeded (1.0)
  // This means we were too pessimistic — error is positive
  // familiarityWeight should increase if domainFamiliarity was high
  for (let i = 0; i < 10; i++) {
    updateWeights(0.3, 1.0, {
      domainFamiliarity: 0.9,
      selectorRisk: 0.1,
      stuckLevel: 0.1,
    });
  }

  const updated = getAdaptiveWeights();
  assert.ok(
    updated.familiarityWeight > initialFamiliarity,
    `familiarityWeight should increase: was ${initialFamiliarity}, got ${updated.familiarityWeight}`
  );
  assert.ok(updated.generation > initial.generation, "Generation should increment");

  resetWeights();
});

// ---------------------------------------------------------------------------
// Test 5: HTN decomposition structure
// ---------------------------------------------------------------------------
test("HTN planner decomposes and traverses correctly", () => {
  const plan = createHTNPlan("Login and navigate to settings");

  // Root should be the only node
  assert.equal(plan.nodes.size, 1);
  const root = plan.nodes.get(plan.rootId)!;
  assert.equal(root.status, "pending");
  assert.equal(root.depth, 0);

  // Decompose root into two sub-goals
  const childIds = decomposeNode(plan, plan.rootId, [
    "Login with credentials",
    "Navigate to settings page",
  ]);
  assert.equal(childIds.length, 2);
  assert.equal(plan.nodes.size, 3); // root + 2 children

  // Root should be marked decomposed
  assert.equal(plan.nodes.get(plan.rootId)!.status, "decomposed");

  // Children should be pending at depth 1
  for (const cid of childIds) {
    const child = plan.nodes.get(cid)!;
    assert.equal(child.status, "pending");
    assert.equal(child.depth, 1);
    assert.equal(child.parentId, plan.rootId);
  }

  // Next executable should be the first child (DFS, leftmost pending leaf)
  const next = getNextExecutableNode(plan);
  assert.ok(next !== null);
  assert.equal(next!.id, childIds[0]);

  // Mark first child done, next should be second child
  markNodeDone(plan, childIds[0]);
  const next2 = getNextExecutableNode(plan);
  assert.ok(next2 !== null);
  assert.equal(next2!.id, childIds[1]);
});
