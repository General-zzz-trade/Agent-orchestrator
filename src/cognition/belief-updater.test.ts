import test from "node:test";
import assert from "node:assert/strict";
import { applyBeliefUpdates } from "./belief-updater";
import type { ExperimentResult, FailureHypothesis } from "./types";

function makeHypothesis(overrides: Partial<FailureHypothesis> = {}): FailureHypothesis {
  return {
    id: "hyp-1",
    kind: "selector_drift",
    explanation: "Selector may have drifted",
    confidence: 0.6,
    belief: { alpha: 2, beta: 1 },
    suggestedExperiments: [],
    recoveryHint: "Try visual fallback",
    ...overrides
  };
}

function makeExperiment(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    id: "exp-1",
    runId: "run-test",
    hypothesisId: "hyp-1",
    experiment: "check selector",
    outcome: "support",
    evidence: [],
    confidenceDelta: 0.15,
    ...overrides
  };
}

// ── Beta distribution update tests ──────────────────────────────────────────

test("support outcome increases alpha in belief", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ outcome: "support", experiment: "check selector" })]
  });
  const h = result.updatedHypotheses[0];
  // selector experiment has weight 1.0, so alpha should increase by 1.0
  assert.equal(h.belief.alpha, 3);
  assert.equal(h.belief.beta, 1);
  // confidence = betaMean = 3 / (3+1) = 0.75
  assert.ok(Math.abs(h.confidence - 0.75) < 0.001);
});

test("refute outcome increases beta in belief", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ outcome: "refute", experiment: "check selector" })]
  });
  const h = result.updatedHypotheses[0];
  // selector experiment has weight 1.0, so beta should increase by 1.0
  assert.equal(h.belief.alpha, 2);
  assert.equal(h.belief.beta, 2);
  // confidence = betaMean = 2 / (2+2) = 0.5
  assert.ok(Math.abs(h.confidence - 0.5) < 0.001);
});

test("inconclusive outcome does not change belief", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ outcome: "inconclusive", experiment: "check selector" })]
  });
  const h = result.updatedHypotheses[0];
  assert.equal(h.belief.alpha, 2);
  assert.equal(h.belief.beta, 1);
  // confidence = betaMean = 2 / (2+1) ≈ 0.6667
  assert.ok(Math.abs(h.confidence - 2 / 3) < 0.001);
});

test("backward compatibility: confidence field still set correctly from Beta mean", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 5, beta: 5 } })],
    experimentResults: [makeExperiment({ outcome: "support", experiment: "check selector" })]
  });
  const h = result.updatedHypotheses[0];
  // alpha=6, beta=5 -> mean = 6/11
  const expected = 6 / 11;
  assert.ok(Math.abs(h.confidence - expected) < 0.001);
  assert.equal(typeof h.confidence, "number");
});

test("single supporting experiment increases confidence", () => {
  // Starting belief: alpha=2, beta=1 -> mean=0.6667
  // After support with selector weight 1.0: alpha=3, beta=1 -> mean=0.75
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ outcome: "support" })]
  });
  assert.equal(result.updatedHypotheses.length, 1);
  assert.ok(Math.abs(result.updatedHypotheses[0].confidence - 0.75) < 0.001);
});

test("single refuting experiment decreases confidence", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ outcome: "refute" })]
  });
  // alpha=2, beta=2 -> mean=0.5
  assert.ok(Math.abs(result.updatedHypotheses[0].confidence - 0.5) < 0.001);
});

test("multiple experiments for same hypothesis accumulate updates", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ id: "hyp-1", belief: { alpha: 2, beta: 1 } })],
    experimentResults: [
      makeExperiment({ hypothesisId: "hyp-1", outcome: "support", experiment: "check selector" }),
      makeExperiment({ id: "exp-2", hypothesisId: "hyp-1", outcome: "support", experiment: "check selector" })
    ]
  });
  const h = result.updatedHypotheses[0];
  // Two supports with weight 1.0 each: alpha = 2+1+1 = 4, beta=1
  assert.equal(h.belief.alpha, 4);
  assert.equal(h.belief.beta, 1);
  // confidence = 4/5 = 0.8
  assert.ok(Math.abs(h.confidence - 0.8) < 0.001);
});

test("no matching experiments leave belief and confidence unchanged", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ id: "hyp-1", belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({ hypothesisId: "hyp-other" })]
  });
  const h = result.updatedHypotheses[0];
  assert.equal(h.belief.alpha, 2);
  assert.equal(h.belief.beta, 1);
  // betaMean(2,1) = 2/3
  assert.ok(Math.abs(h.confidence - 2 / 3) < 0.001);
});

test("hypotheses sorted by confidence descending after update", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [
      makeHypothesis({ id: "hyp-low", belief: { alpha: 1, beta: 3 } }),
      makeHypothesis({ id: "hyp-high", belief: { alpha: 4, beta: 1 } })
    ],
    experimentResults: []
  });
  assert.equal(result.updatedHypotheses[0].id, "hyp-high");
  assert.equal(result.updatedHypotheses[1].id, "hyp-low");
});

test("belief updates are generated for each hypothesis", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [
      makeHypothesis({ id: "hyp-1" }),
      makeHypothesis({ id: "hyp-2" })
    ],
    experimentResults: []
  });
  assert.equal(result.beliefUpdates.length, 2);
  assert.ok(result.beliefUpdates.every((u) => u.runId === "run-test"));
});

test("empty hypotheses and experiments returns empty arrays", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [],
    experimentResults: []
  });
  assert.equal(result.updatedHypotheses.length, 0);
  assert.equal(result.beliefUpdates.length, 0);
});

test("selector probe experiment has higher weight than assertion overlap", () => {
  // Both start with same belief, both get "support" outcome
  // Selector weight = 1.0, assertion weight = 0.6
  const selectorResult = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ id: "hyp-sel", belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({
      hypothesisId: "hyp-sel",
      experiment: "check selector presence in DOM",
      outcome: "support"
    })]
  });

  const assertResult = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ id: "hyp-assert", belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({
      hypothesisId: "hyp-assert",
      experiment: "compare expected assertion text with visible text",
      outcome: "support"
    })]
  });

  const baseConf = 2 / 3; // betaMean(2, 1)
  const selectorDelta = selectorResult.updatedHypotheses[0].confidence - baseConf;
  const assertDelta = assertResult.updatedHypotheses[0].confidence - baseConf;
  assert.ok(selectorDelta > assertDelta,
    `Selector delta ${selectorDelta} should be > assertion delta ${assertDelta}`);
});

test("readiness probe has medium weight", () => {
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [makeHypothesis({ belief: { alpha: 2, beta: 1 } })],
    experimentResults: [makeExperiment({
      experiment: "wait briefly and inspect readiness signals",
      outcome: "support"
    })]
  });
  // Readiness weight = 0.8, alpha goes from 2 to 2.8
  assert.ok(Math.abs(result.updatedHypotheses[0].belief.alpha - 2.8) < 0.001);
  // confidence = 2.8 / (2.8 + 1) = 2.8/3.8
  const expected = 2.8 / 3.8;
  assert.ok(Math.abs(result.updatedHypotheses[0].confidence - expected) < 0.01);
});

test("hypothesis without belief field gets default belief", () => {
  // Simulate a hypothesis that might not have belief (e.g. from old code)
  const h = makeHypothesis({});
  // Remove belief to test default path in applyBeliefUpdates
  delete (h as unknown as Record<string, unknown>).belief;
  const result = applyBeliefUpdates({
    runId: "run-test",
    hypotheses: [h as FailureHypothesis],
    experimentResults: [makeExperiment({ outcome: "support" })]
  });
  // Should default to alpha=2, beta=1, then support adds 1.0: alpha=3, beta=1
  assert.equal(result.updatedHypotheses[0].belief.alpha, 3);
  assert.equal(result.updatedHypotheses[0].belief.beta, 1);
});
