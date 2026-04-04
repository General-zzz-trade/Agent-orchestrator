/**
 * Token Budget Control — enforces token spending limits for LLM call points.
 *
 * Reads defaults from environment variables:
 *   TOKEN_BUDGET_PER_RUN       (default 50000)
 *   TOKEN_BUDGET_PER_RECOVERY  (default 5000)
 *   TOKEN_BUDGET_PER_HYPOTHESIS (default 2000)
 */

export interface TokenBudget {
  maxTokensPerRun: number;
  maxTokensPerRecovery: number;
  maxTokensPerHypothesis: number;
  currentRunTokens: number;
  currentRecoveryTokens: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createTokenBudget(
  overrides?: Partial<Omit<TokenBudget, "currentRunTokens" | "currentRecoveryTokens">>
): TokenBudget {
  return {
    maxTokensPerRun: overrides?.maxTokensPerRun ?? envInt("TOKEN_BUDGET_PER_RUN", 50_000),
    maxTokensPerRecovery: overrides?.maxTokensPerRecovery ?? envInt("TOKEN_BUDGET_PER_RECOVERY", 5_000),
    maxTokensPerHypothesis: overrides?.maxTokensPerHypothesis ?? envInt("TOKEN_BUDGET_PER_HYPOTHESIS", 2_000),
    currentRunTokens: 0,
    currentRecoveryTokens: 0,
  };
}

export function canSpendTokens(
  budget: TokenBudget,
  category: "run" | "recovery" | "hypothesis",
  requestedTokens: number
): boolean {
  switch (category) {
    case "run":
      return budget.currentRunTokens + requestedTokens <= budget.maxTokensPerRun;
    case "recovery":
      return budget.currentRecoveryTokens + requestedTokens <= budget.maxTokensPerRecovery;
    case "hypothesis":
      // Hypothesis budget is a per-call limit, checked against the recovery budget pool
      return requestedTokens <= budget.maxTokensPerHypothesis
        && budget.currentRecoveryTokens + requestedTokens <= budget.maxTokensPerRecovery;
    default:
      return false;
  }
}

export function recordTokenSpend(
  budget: TokenBudget,
  category: "run" | "recovery" | "hypothesis",
  tokens: number
): void {
  switch (category) {
    case "run":
      budget.currentRunTokens += tokens;
      break;
    case "recovery":
    case "hypothesis":
      budget.currentRecoveryTokens += tokens;
      break;
  }
}

export function resetRecoveryBudget(budget: TokenBudget): void {
  budget.currentRecoveryTokens = 0;
}
