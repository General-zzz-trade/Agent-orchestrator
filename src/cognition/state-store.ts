import type { AgentObservation, VerificationResult, WorldStateSnapshot } from "./types";

export function createInitialWorldState(goal: string): WorldStateSnapshot {
  return {
    runId: createSyntheticRunId(goal),
    timestamp: new Date().toISOString(),
    source: "state_update",
    reason: "initial_world_state",
    appState: "unknown",
    uncertaintyScore: 1,
    facts: [`goal:${goal.trim().slice(0, 200)}`]
  };
}

export function attachWorldStateRunId(
  state: WorldStateSnapshot,
  runId: string
): WorldStateSnapshot {
  return {
    ...state,
    runId
  };
}

export function updateWorldState(
  previous: WorldStateSnapshot,
  input: {
    observation?: AgentObservation;
    verification?: VerificationResult;
    taskType?: string;
    taskError?: string;
    stateHints?: string[];
  }
): WorldStateSnapshot {
  const facts = new Set(previous.facts);
  const observation = input.observation;
  const verification = input.verification;

  if (input.taskType) {
    facts.add(`last_task:${input.taskType}`);
  }

  if (input.taskError) {
    facts.add(`last_error:${truncate(input.taskError, 160)}`);
  }

  for (const hint of input.stateHints ?? []) {
    facts.add(`hint:${truncate(hint, 120)}`);
  }

  if (observation?.pageUrl) {
    facts.add(`page:${observation.pageUrl}`);
  }

  if (observation?.title) {
    facts.add(`title:${truncate(observation.title, 120)}`);
  }

  return {
    ...previous,
    timestamp: new Date().toISOString(),
    pageUrl: observation?.pageUrl ?? previous.pageUrl,
    lastAction: input.taskType ?? previous.lastAction,
    lastObservationId: observation?.id ?? previous.lastObservationId,
    appState: inferAppState(previous.appState, observation, verification, input.taskError),
    uncertaintyScore: inferUncertainty(previous.uncertaintyScore, observation, verification, input.taskError),
    facts: Array.from(facts).slice(-30)
  };
}

function inferAppState(
  current: WorldStateSnapshot["appState"],
  observation?: AgentObservation,
  verification?: VerificationResult,
  taskError?: string
): WorldStateSnapshot["appState"] {
  if (taskError) {
    return "error";
  }

  const haystack = [
    observation?.appStateGuess,
    observation?.title,
    observation?.visibleText?.join(" ")
  ]
    .filter(Boolean)
    .join(" ");

  if (/dashboard|logout|signed in|authenticated/i.test(haystack)) {
    return "authenticated";
  }

  if (/ready|home|welcome/i.test(haystack)) {
    return "ready";
  }

  if (/loading|starting|please wait/i.test(haystack)) {
    return "loading";
  }

  if (verification?.passed && verification.verifier === "state") {
    return "ready";
  }

  return current;
}

function inferUncertainty(
  current: number,
  observation?: AgentObservation,
  verification?: VerificationResult,
  taskError?: string
): number {
  if (taskError) {
    return 1;
  }

  if (verification) {
    return verification.passed ? Math.max(0.05, current - 0.2) : Math.min(1, current + 0.25);
  }

  if (observation) {
    return Math.max(0.1, 1 - observation.confidence);
  }

  return current;
}

function createSyntheticRunId(goal: string): string {
  return `pending-${Buffer.from(goal).toString("base64").slice(0, 10)}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
