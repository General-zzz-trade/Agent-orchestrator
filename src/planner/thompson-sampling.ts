/**
 * Thompson Sampling for adaptive planner selection.
 * Each (planner, goalCategory) pair has a Beta belief.
 */

import { BetaBelief, sampleBeta, betaMean } from "../cognition/types";

export interface PlannerStats {
  planner: string;
  goalCategory: string;
  belief: BetaBelief;
  totalTokens: number;
}

// In-memory stats (persisted via knowledge store in future)
const stats = new Map<string, PlannerStats>();

function key(planner: string, goalCategory: string): string {
  return `${planner}::${goalCategory}`;
}

export function selectPlannerThompson(
  candidates: string[],
  goalCategory: string
): { selected: string; score: number; explored: boolean } {
  let best = candidates[0];
  let bestScore = -1;
  let explored = false;

  for (const planner of candidates) {
    const k = key(planner, goalCategory);
    const s = stats.get(k);
    if (!s) {
      // Unknown planner — sample from uniform prior
      const score = Math.random();
      if (score > bestScore) {
        best = planner;
        bestScore = score;
        explored = true;
      }
      continue;
    }
    const score = sampleBeta(s.belief);
    // Penalize high-cost planners slightly
    const costPenalty = s.totalTokens > 0 ? Math.min(0.1, s.totalTokens / 100000) : 0;
    const adjusted = score - costPenalty;
    if (adjusted > bestScore) {
      best = planner;
      bestScore = adjusted;
      explored = betaVariance(s.belief) > 0.02; // high uncertainty = exploration
    }
  }

  return { selected: best, score: bestScore, explored };
}

function betaVariance(b: BetaBelief): number {
  const s = b.alpha + b.beta;
  return (b.alpha * b.beta) / (s * s * (s + 1));
}

export function recordPlannerOutcome(
  planner: string,
  goalCategory: string,
  success: boolean,
  tokensUsed: number
): void {
  const k = key(planner, goalCategory);
  const existing = stats.get(k) ?? {
    planner, goalCategory,
    belief: { alpha: 1, beta: 1 },
    totalTokens: 0
  };
  if (success) existing.belief.alpha += 1;
  else existing.belief.beta += 1;
  existing.totalTokens += tokensUsed;
  stats.set(k, existing);
}

export function getPlannerStats(): PlannerStats[] {
  return Array.from(stats.values());
}

export function restoreStats(data: PlannerStats[]): void {
  stats.clear();
  for (const s of data) {
    stats.set(key(s.planner, s.goalCategory), s);
  }
}

export function resetPlannerStats(): void {
  stats.clear();
}
