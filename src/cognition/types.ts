export type CognitiveStepKind =
  | "observe"
  | "execute"
  | "hypothesize"
  | "experiment"
  | "verify"
  | "recover"
  | "abort";

export type WorldStateAppState =
  | "unknown"
  | "loading"
  | "ready"
  | "authenticated"
  | "error";

export type VerifierKind = "action" | "state" | "goal";
export type ObservationSource = "task_observe" | "experiment_refresh" | "recovery_followup";

export interface ActionableElementObservation {
  role?: string;
  text?: string;
  selector?: string;
  confidence: number;
}

export interface AgentObservation {
  id: string;
  runId: string;
  taskId?: string;
  timestamp: string;
  source: ObservationSource;
  pageUrl?: string;
  title?: string;
  visibleText?: string[];
  actionableElements?: ActionableElementObservation[];
  appStateGuess?: string;
  sceneDescription?: {
    pageType: string;
    keyElements: Array<{ type: string; label: string; state?: string }>;
    stateIndicators: string[];
    confidence: number;
  };
  anomalies: string[];
  confidence: number;
}

export interface ObservationPatch {
  pageUrl?: string;
  title?: string;
  visibleText?: string[];
  appStateGuess?: string;
  anomalies?: string[];
  confidence?: number;
}

export interface WorldStateSnapshot {
  runId: string;
  timestamp: string;
  source?: ObservationSource | "state_update";
  reason?: string;
  pageUrl?: string;
  appState: WorldStateAppState;
  lastAction?: string;
  lastObservationId?: string;
  uncertaintyScore: number;
  facts: string[];
}

export interface VerificationResult {
  runId: string;
  taskId?: string;
  verifier: VerifierKind;
  passed: boolean;
  confidence: number;
  rationale: string;
  evidence: string[];
}

export interface EpisodeEvent {
  id: string;
  runId: string;
  taskId?: string;
  kind: CognitiveStepKind;
  timestamp: string;
  summary: string;
  observationId?: string;
  verificationPassed?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface CognitiveDecision {
  nextAction: "continue" | "retry_task" | "reobserve" | "replan" | "abort";
  rationale: string;
  confidence: number;
}

export type FailureHypothesisKind =
  | "state_not_ready"
  | "selector_drift"
  | "assertion_phrase_changed"
  | "session_not_established"
  | "missing_page_context"
  | "learned_pattern"
  | "discovered"
  | "unknown";

/** Beta distribution for Bayesian belief tracking. */
export interface BetaBelief {
  alpha: number;   // pseudo-successes (prior + observed)
  beta: number;    // pseudo-failures  (prior + observed)
}

export function betaMean(b: BetaBelief): number {
  return b.alpha / (b.alpha + b.beta);
}

export function betaVariance(b: BetaBelief): number {
  const s = b.alpha + b.beta;
  return (b.alpha * b.beta) / (s * s * (s + 1));
}

/** Sample from Beta distribution using Jöhnk's algorithm. */
export function sampleBeta(b: BetaBelief): number {
  // Simple approximation: use inverse CDF via uniform random
  // For production, use a proper Beta sampler; this is adequate for Thompson Sampling
  const u = Math.random();
  // Use the quantile approximation: mean ± variance-scaled random
  const mean = betaMean(b);
  const std = Math.sqrt(betaVariance(b));
  return Math.max(0, Math.min(1, mean + std * (u * 2 - 1) * 1.5));
}

export interface FailureHypothesis {
  id: string;
  taskId?: string;
  kind: FailureHypothesisKind;
  explanation: string;
  confidence: number;
  belief: BetaBelief;
  suggestedExperiments: string[];
  recoveryHint: string;
}

// ── Leap 3: Learned World Model ─────────────────────────────────────────────

export interface StateEmbedding {
  vector: number[];
  clusterId?: string;
  timestamp: string;
}

// ── Leap 4: Hierarchical Task Network ───────────────────────────────────────

export type HTNNodeStatus = "pending" | "active" | "done" | "failed" | "decomposed";

export interface HTNGoalNode {
  id: string;
  goal: string;
  parentId?: string;
  children: string[];       // child node IDs (empty = leaf/primitive)
  status: HTNNodeStatus;
  depth: number;
  maxDecomposeAttempts: number;
  decomposeAttempts: number;
  result?: { success: boolean; error?: string };
}

export interface HTNPlan {
  nodes: Map<string, HTNGoalNode>;
  rootId: string;
}

// ── Leap 5: Program Synthesis Recovery ──────────────────────────────────────

export interface RecoveryProgram {
  id: string;
  triggerPattern: string;       // error pattern that triggers this program
  triggerStateEmbedding?: number[];  // optional state context
  steps: Array<{ type: string; payload: Record<string, unknown> }>;
  successCount: number;
  failureCount: number;
  createdAt: string;
}

// ── Leap 6: Counterfactual Reasoning ────────────────────────────────────────

export interface CounterfactualQuery {
  observedState: string;
  observedAction: string;
  observedOutcome: string;
  hypotheticalAction: string;  // "what if I had done X instead?"
}

export interface CounterfactualResult {
  query: CounterfactualQuery;
  predictedOutcome: string;
  predictedSuccess: boolean;
  confidence: number;
  reasoning: string;
}

// ── Leap 7: Self-Improvement ────────────────────────────────────────────────

export interface AdaptiveWeights {
  familiarityWeight: number;   // default 0.3
  riskWeight: number;          // default 0.3
  stuckWeight: number;         // default 0.4
  generation: number;          // how many updates applied
  lastUpdated: string;
}

export interface PromptVariant {
  id: string;
  role: "planner" | "replanner" | "diagnoser";
  systemPrompt: string;
  successCount: number;
  failureCount: number;
  belief: BetaBelief;
  createdAt: string;
}

export interface ExperimentResult {
  id: string;
  runId: string;
  taskId?: string;
  hypothesisId: string;
  experiment: string;
  performedAction?: string;
  outcome: "support" | "refute" | "inconclusive";
  evidence: string[];
  confidenceDelta: number;
  observationPatch?: ObservationPatch;
  stateHints?: string[];
}

export interface BeliefUpdate {
  id: string;
  runId: string;
  taskId?: string;
  hypothesisId: string;
  previousConfidence: number;
  nextConfidence: number;
  rationale: string;
}

export interface ObservationInput {
  runId: string;
  taskId?: string;
  source?: ObservationSource;
  pageUrl?: string;
  title?: string;
  visibleText?: string[];
  actionableElements?: ActionableElementObservation[];
  appStateGuess?: string;
  sceneDescription?: {
    pageType: string;
    keyElements: Array<{ type: string; label: string; state?: string }>;
    stateIndicators: string[];
    confidence: number;
  };
  anomalies?: string[];
  confidence?: number;
}
