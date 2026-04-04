/**
 * Counterfactual Reasoning — extends the causal graph with
 * intervention and counterfactual queries.
 *
 * Supports three levels of causal inference:
 * 1. Observation: P(Y|X) — what outcome given this state?
 * 2. Intervention: P(Y|do(X)) — what if we force action X?
 * 3. Counterfactual: P(Y_x'|X=x, Y=y) — what would have happened if we did X' instead?
 */

import type { CausalGraph, CausalEdge } from "./causal-graph";
import type { CounterfactualQuery, CounterfactualResult } from "../cognition/types";

/**
 * Interventional query: Given state S, what is the expected outcome of action A?
 * Unlike observational P(outcome|state,action), this "cuts" incoming edges to the action node,
 * only considering the direct effect of the action.
 */
export function interventionalQuery(
  graph: CausalGraph,
  state: string,
  action: string,
  actionDetail?: string
): { predictedStates: Array<{ state: string; probability: number }>; totalEvidence: number } {
  const edges = graph.edgesBySource.get(state) ?? [];

  // Filter edges matching the intervention action
  const matching = edges.filter(e => {
    if (e.action !== action) return false;
    if (actionDetail && e.actionDetail !== actionDetail) return false;
    return true;
  });

  if (matching.length === 0) {
    return { predictedStates: [], totalEvidence: 0 };
  }

  const totalTrials = matching.reduce((s, e) => s + e.successCount + e.failureCount, 0);
  const outcomeMap = new Map<string, number>();

  for (const edge of matching) {
    const prob = edge.successCount / Math.max(1, totalTrials);
    outcomeMap.set(edge.toState, (outcomeMap.get(edge.toState) ?? 0) + prob);
  }

  const predictedStates = Array.from(outcomeMap.entries())
    .map(([state, probability]) => ({ state, probability }))
    .sort((a, b) => b.probability - a.probability);

  return { predictedStates, totalEvidence: totalTrials };
}

/**
 * Counterfactual query: Given that we observed (state, action, outcome),
 * what would have happened if we had taken a different action?
 *
 * Uses the structural equation approach:
 * 1. Abduction: infer background conditions from observed outcome
 * 2. Intervention: substitute the hypothetical action
 * 3. Prediction: compute the counterfactual outcome
 */
export function counterfactualQuery(
  graph: CausalGraph,
  query: CounterfactualQuery
): CounterfactualResult {
  // Step 1: Abduction — find all edges from observed state with observed action
  const observedEdges = (graph.edgesBySource.get(query.observedState) ?? [])
    .filter(e => e.action === query.observedAction);

  // Step 2: Intervention — find edges from same state with hypothetical action
  const hypotheticalEdges = (graph.edgesBySource.get(query.observedState) ?? [])
    .filter(e => e.action === query.hypotheticalAction);

  if (hypotheticalEdges.length === 0) {
    return {
      query,
      predictedOutcome: "unknown",
      predictedSuccess: false,
      confidence: 0.1,
      reasoning: `No evidence for action "${query.hypotheticalAction}" from state "${query.observedState}".`
    };
  }

  // Step 3: Prediction — use the highest-confidence hypothetical edge
  const bestEdge = hypotheticalEdges.sort((a, b) => b.confidence - a.confidence)[0];
  const totalTrials = bestEdge.successCount + bestEdge.failureCount;

  // Adjust confidence based on evidence strength
  const evidenceConfidence = Math.min(0.95, 0.3 + totalTrials * 0.05);

  // Compare with observed outcome to generate reasoning
  const wouldSucceed = bestEdge.confidence > 0.5;
  const observedSucceeded = !query.observedOutcome.startsWith("error:");

  let reasoning: string;
  if (wouldSucceed && !observedSucceeded) {
    reasoning = `Counterfactual: "${query.hypotheticalAction}" would likely have succeeded (${(bestEdge.confidence * 100).toFixed(0)}% success rate) where "${query.observedAction}" failed.`;
  } else if (!wouldSucceed && observedSucceeded) {
    reasoning = `Counterfactual: "${query.hypotheticalAction}" would likely have failed (${(bestEdge.confidence * 100).toFixed(0)}% success rate) where "${query.observedAction}" succeeded.`;
  } else {
    reasoning = `Counterfactual: "${query.hypotheticalAction}" would have similar outcome (${(bestEdge.confidence * 100).toFixed(0)}% success rate).`;
  }

  return {
    query,
    predictedOutcome: bestEdge.toState,
    predictedSuccess: wouldSucceed,
    confidence: evidenceConfidence,
    reasoning
  };
}

/**
 * Compute interventional effect: P(outcome | do(action)) vs P(outcome | observed_action)
 * Uses the adjustment formula approximation:
 * For each edge from the state with the given action, compute:
 * - Direct effect: edge.successCount / (edge.successCount + edge.failureCount)
 * - Confounded rate: average success rate of ALL edges from this state
 * - Causal effect = direct - confounded (positive = action helps beyond baseline)
 */
export function computeInterventionalEffect(
  graph: CausalGraph,
  state: string,
  action: string
): { directEffect: number; baselineRate: number; causalEffect: number; predictedOutcome: string } {
  const allEdges = graph.edgesBySource.get(state) ?? [];

  // Compute baseline: average success rate across ALL edges from this state
  let totalSuccess = 0;
  let totalTrials = 0;
  for (const e of allEdges) {
    const trials = e.successCount + e.failureCount;
    totalSuccess += e.successCount;
    totalTrials += trials;
  }
  const baselineRate = totalTrials > 0 ? totalSuccess / totalTrials : 0;

  // Compute direct effect for the specific action
  const actionEdges = allEdges.filter(e => e.action === action);
  let actionSuccess = 0;
  let actionTrials = 0;
  let bestOutcome = "unknown";
  let bestOutcomeProb = 0;

  for (const e of actionEdges) {
    const trials = e.successCount + e.failureCount;
    actionSuccess += e.successCount;
    actionTrials += trials;
    const prob = trials > 0 ? e.successCount / trials : 0;
    if (prob > bestOutcomeProb) {
      bestOutcomeProb = prob;
      bestOutcome = e.toState;
    }
  }

  const directEffect = actionTrials > 0 ? actionSuccess / actionTrials : 0;
  const causalEffect = directEffect - baselineRate;

  return { directEffect, baselineRate, causalEffect, predictedOutcome: bestOutcome };
}

/**
 * Find alternative actions for a failed state-action pair.
 * Returns actions sorted by causal effect (how much better than baseline).
 */
export function suggestAlternativeActions(
  graph: CausalGraph,
  failedState: string,
  failedAction: string
): Array<{ action: string; detail: string; successProbability: number; evidence: number; causalEffect: number }> {
  const edges = graph.edgesBySource.get(failedState) ?? [];

  // Filter for different actions that succeeded from this state
  const alternatives = edges
    .filter(e => e.action !== failedAction && e.confidence > 0.3)
    .map(e => {
      const effect = computeInterventionalEffect(graph, failedState, e.action);
      return {
        action: e.action,
        detail: e.actionDetail,
        successProbability: e.confidence,
        evidence: e.successCount + e.failureCount,
        causalEffect: effect.causalEffect
      };
    })
    .sort((a, b) => b.causalEffect - a.causalEffect);

  return alternatives;
}
