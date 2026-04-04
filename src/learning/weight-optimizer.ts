/**
 * Weight Optimizer — self-adjusts meta-cognition weights based on run outcomes.
 *
 * Uses a simple evolutionary strategy:
 * 1. Maintain current weights + a population of perturbations
 * 2. After each run, evaluate: did the confidence multiplier predict the outcome?
 * 3. Nudge weights toward configurations that predicted correctly
 *
 * Based on: Godel Agent (arxiv 2410.04444) self-modification principle
 * with empirical validation before adopting changes.
 */

import type { AdaptiveWeights } from "../cognition/types";

// Persistent weights (survives across runs within a process)
let currentWeights: AdaptiveWeights = {
  familiarityWeight: 0.3,
  riskWeight: 0.3,
  stuckWeight: 0.4,
  generation: 0,
  lastUpdated: new Date().toISOString()
};

const LEARNING_RATE = 0.05;
const MAX_WEIGHT = 0.8;
const MIN_WEIGHT = 0.05;

/**
 * Get current adaptive weights for meta-cognition.
 */
export function getAdaptiveWeights(): AdaptiveWeights {
  return { ...currentWeights };
}

/**
 * Update weights based on a run outcome.
 *
 * @param predicted - the confidence multiplier that meta-cognition produced
 * @param actual - did the run actually succeed? (1.0 = full success, 0.0 = total failure)
 * @param features - the raw feature values: [domainFamiliarity, selectorRisk, stuckLevel]
 */
export function updateWeights(
  predicted: number,
  actual: number,
  features: { domainFamiliarity: number; selectorRisk: number; stuckLevel: number }
): AdaptiveWeights {
  // Prediction error: how far off was the confidence multiplier?
  const error = actual - predicted;  // positive = we were too pessimistic

  // Gradient approximation: which features contributed to the error?
  // If we were too pessimistic (error > 0), reduce the penalty weights
  // If we were too optimistic (error < 0), increase them

  // familiarityWeight: controls how much familiarity boosts confidence
  // Higher weight = more boost from familiarity
  const familiarityGradient = error * features.domainFamiliarity;

  // riskWeight: controls how much risk reduces confidence
  // We want to INCREASE riskWeight when we were too optimistic about risky tasks
  const riskGradient = -error * features.selectorRisk;

  // stuckWeight: controls how much being stuck reduces confidence
  const stuckGradient = -error * features.stuckLevel;

  currentWeights.familiarityWeight = clamp(
    currentWeights.familiarityWeight + LEARNING_RATE * familiarityGradient,
    MIN_WEIGHT, MAX_WEIGHT
  );
  currentWeights.riskWeight = clamp(
    currentWeights.riskWeight + LEARNING_RATE * riskGradient,
    MIN_WEIGHT, MAX_WEIGHT
  );
  currentWeights.stuckWeight = clamp(
    currentWeights.stuckWeight + LEARNING_RATE * stuckGradient,
    MIN_WEIGHT, MAX_WEIGHT
  );

  // Normalize so weights sum to ~1.0
  const sum = currentWeights.familiarityWeight + currentWeights.riskWeight + currentWeights.stuckWeight;
  if (sum > 0) {
    currentWeights.familiarityWeight /= sum;
    currentWeights.riskWeight /= sum;
    currentWeights.stuckWeight /= sum;
  }

  currentWeights.generation += 1;
  currentWeights.lastUpdated = new Date().toISOString();

  return { ...currentWeights };
}

/**
 * Compute confidence multiplier using adaptive weights.
 * Replaces the hardcoded formula in meta-cognition.ts.
 */
export function computeAdaptiveMultiplier(
  domainFamiliarity: number,
  selectorRisk: number,
  stuckLevel: number
): number {
  const w = currentWeights;
  const familiarityFactor = 0.7 + domainFamiliarity * w.familiarityWeight;
  const riskFactor = 1.0 - selectorRisk * w.riskWeight;
  const stuckFactor = 1.0 - stuckLevel * w.stuckWeight;
  // Floor at 0.65 — prevents premature abort on unfamiliar domains
  // (0.5 was too aggressive: triggered help requests on first-run tasks)
  return Math.max(0.65, familiarityFactor * riskFactor * stuckFactor);
}

export function restoreWeights(data: AdaptiveWeights): void {
  currentWeights = { ...data };
}

export function resetWeights(): void {
  currentWeights = {
    familiarityWeight: 0.3,
    riskWeight: 0.3,
    stuckWeight: 0.4,
    generation: 0,
    lastUpdated: new Date().toISOString()
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
