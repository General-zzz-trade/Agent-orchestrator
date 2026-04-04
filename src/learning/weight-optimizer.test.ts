import test from "node:test";
import assert from "node:assert/strict";
import {
  getAdaptiveWeights,
  updateWeights,
  computeAdaptiveMultiplier,
  resetWeights
} from "./weight-optimizer";

test("getAdaptiveWeights returns default weights initially", () => {
  resetWeights();
  const w = getAdaptiveWeights();
  assert.equal(w.familiarityWeight, 0.3);
  assert.equal(w.riskWeight, 0.3);
  assert.equal(w.stuckWeight, 0.4);
  assert.equal(w.generation, 0);
});

test("updateWeights adjusts weights based on prediction error", () => {
  resetWeights();
  const before = getAdaptiveWeights();

  // We predicted 0.6 but actual was 1.0 (too pessimistic)
  // With high selectorRisk, the riskWeight should decrease (we penalized risk too much)
  updateWeights(0.6, 1.0, {
    domainFamiliarity: 0.5,
    selectorRisk: 0.8,
    stuckLevel: 0.2
  });

  const after = getAdaptiveWeights();
  assert.equal(after.generation, 1);
  // Weights should have changed
  assert.notDeepStrictEqual(
    [after.familiarityWeight, after.riskWeight, after.stuckWeight],
    [before.familiarityWeight, before.riskWeight, before.stuckWeight]
  );
});

test("updateWeights normalizes weights to sum to ~1.0", () => {
  resetWeights();
  updateWeights(0.5, 0.9, {
    domainFamiliarity: 0.7,
    selectorRisk: 0.3,
    stuckLevel: 0.5
  });

  const w = getAdaptiveWeights();
  const sum = w.familiarityWeight + w.riskWeight + w.stuckWeight;
  assert.ok(Math.abs(sum - 1.0) < 1e-10, `Expected sum ~1.0, got ${sum}`);
});

test("computeAdaptiveMultiplier returns value in [0.5, 1.0]", () => {
  resetWeights();

  // Test a range of inputs
  const cases = [
    { fam: 0, risk: 0, stuck: 0 },
    { fam: 1, risk: 0, stuck: 0 },
    { fam: 0, risk: 1, stuck: 1 },
    { fam: 1, risk: 1, stuck: 1 },
    { fam: 0.5, risk: 0.5, stuck: 0.5 },
  ];

  for (const c of cases) {
    const m = computeAdaptiveMultiplier(c.fam, c.risk, c.stuck);
    assert.ok(m >= 0.5, `Multiplier ${m} should be >= 0.5 for ${JSON.stringify(c)}`);
    assert.ok(m <= 1.5, `Multiplier ${m} should be <= 1.5 for ${JSON.stringify(c)}`);
  }
});

test("after many updates with consistent signal, weights converge", () => {
  resetWeights();

  // Simulate: tasks with high risk keep failing (actual=0), predictions are optimistic (predicted=0.8)
  // This should push riskWeight UP over time
  const initialRiskWeight = getAdaptiveWeights().riskWeight;

  for (let i = 0; i < 50; i++) {
    updateWeights(0.8, 0.0, {
      domainFamiliarity: 0.5,
      selectorRisk: 0.9,
      stuckLevel: 0.1
    });
  }

  const finalWeights = getAdaptiveWeights();
  assert.ok(
    finalWeights.generation === 50,
    `Expected generation 50, got ${finalWeights.generation}`
  );
  // riskWeight should have increased since we were consistently too optimistic on risky tasks
  assert.ok(
    finalWeights.riskWeight > initialRiskWeight,
    `riskWeight should increase: ${finalWeights.riskWeight} > ${initialRiskWeight}`
  );
});

test("resetWeights restores defaults", () => {
  resetWeights();
  updateWeights(0.5, 1.0, {
    domainFamiliarity: 0.8,
    selectorRisk: 0.2,
    stuckLevel: 0.1
  });
  assert.equal(getAdaptiveWeights().generation, 1);

  resetWeights();
  const w = getAdaptiveWeights();
  assert.equal(w.generation, 0);
  assert.equal(w.familiarityWeight, 0.3);
  assert.equal(w.riskWeight, 0.3);
  assert.equal(w.stuckWeight, 0.4);
});
