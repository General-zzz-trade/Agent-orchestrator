import test from "node:test";
import assert from "node:assert/strict";
import {
  createTokenBudget,
  canSpendTokens,
  recordTokenSpend,
  resetRecoveryBudget,
} from "./token-budget";

test("creates budget with defaults", () => {
  const budget = createTokenBudget();
  assert.equal(budget.maxTokensPerRun, 50_000);
  assert.equal(budget.maxTokensPerRecovery, 5_000);
  assert.equal(budget.maxTokensPerHypothesis, 2_000);
  assert.equal(budget.currentRunTokens, 0);
  assert.equal(budget.currentRecoveryTokens, 0);
});

test("canSpendTokens returns false when budget exceeded", () => {
  const budget = createTokenBudget({ maxTokensPerRun: 100, maxTokensPerRecovery: 50 });

  // Within budget
  assert.equal(canSpendTokens(budget, "run", 100), true);

  // Spend up to the limit
  recordTokenSpend(budget, "run", 90);
  assert.equal(canSpendTokens(budget, "run", 11), false);
  assert.equal(canSpendTokens(budget, "run", 10), true);

  // Recovery budget
  recordTokenSpend(budget, "recovery", 45);
  assert.equal(canSpendTokens(budget, "recovery", 6), false);
  assert.equal(canSpendTokens(budget, "recovery", 5), true);
});

test("recordTokenSpend accumulates correctly", () => {
  const budget = createTokenBudget();

  recordTokenSpend(budget, "run", 1000);
  recordTokenSpend(budget, "run", 2500);
  assert.equal(budget.currentRunTokens, 3500);

  recordTokenSpend(budget, "recovery", 300);
  recordTokenSpend(budget, "hypothesis", 200);
  assert.equal(budget.currentRecoveryTokens, 500);
});

test("resetRecoveryBudget clears recovery counter", () => {
  const budget = createTokenBudget();

  recordTokenSpend(budget, "recovery", 3000);
  recordTokenSpend(budget, "hypothesis", 1000);
  assert.equal(budget.currentRecoveryTokens, 4000);

  resetRecoveryBudget(budget);
  assert.equal(budget.currentRecoveryTokens, 0);
  // Run tokens should be unaffected
  recordTokenSpend(budget, "run", 500);
  resetRecoveryBudget(budget);
  assert.equal(budget.currentRunTokens, 500);
});
