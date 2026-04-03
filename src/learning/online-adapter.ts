/**
 * Online Adapter — immediate within-run strategy adjustment.
 * When a task fails, the lesson is recorded instantly (not waiting for run end)
 * so subsequent tasks in the same run benefit from it.
 */

import type { AgentTask, RunContext } from "../types";

export interface RunTimeLesson {
  selector: string;
  taskType: string;
  failureReason: string;
  learnedAt: number;       // task index where failure occurred
  suggestedStrategy: string;
}

export interface OnlineAdapterState {
  lessons: RunTimeLesson[];
  failedSelectors: Map<string, number>;  // selector → failure count
  failedTaskTypes: Map<string, number>;  // taskType → failure count
}

export function createOnlineAdapterState(): OnlineAdapterState {
  return {
    lessons: [],
    failedSelectors: new Map(),
    failedTaskTypes: new Map()
  };
}

/**
 * Record a task failure for immediate use within the same run.
 */
export function recordInRunFailure(
  state: OnlineAdapterState,
  task: AgentTask,
  failureReason: string,
  taskIndex: number
): RunTimeLesson {
  const selector = String(task.payload.selector ?? task.payload.description ?? "");

  // Track failure counts
  if (selector) {
    state.failedSelectors.set(selector, (state.failedSelectors.get(selector) ?? 0) + 1);
  }
  state.failedTaskTypes.set(task.type, (state.failedTaskTypes.get(task.type) ?? 0) + 1);

  const lesson: RunTimeLesson = {
    selector,
    taskType: task.type,
    failureReason,
    learnedAt: taskIndex,
    suggestedStrategy: inferStrategy(task, selector, state)
  };

  state.lessons.push(lesson);
  return lesson;
}

/**
 * Check if a task should be adapted based on in-run lessons.
 * Returns a suggested modification, or null if no adaptation needed.
 */
export function suggestAdaptation(
  state: OnlineAdapterState,
  task: AgentTask
): { strategy: string; reason: string } | null {
  const selector = String(task.payload.selector ?? task.payload.description ?? "");

  // Check if this exact selector has failed before in this run
  if (selector && (state.failedSelectors.get(selector) ?? 0) >= 1) {
    const failCount = state.failedSelectors.get(selector)!;
    if (task.type === "click" || task.type === "type" || task.type === "select") {
      return {
        strategy: `visual_${task.type === "select" ? "click" : task.type}`,
        reason: `Selector "${selector}" has failed ${failCount} time(s) in this run. Switching to visual strategy.`
      };
    }
  }

  // Check if this task type has been consistently failing
  const typeFailures = state.failedTaskTypes.get(task.type) ?? 0;
  if (typeFailures >= 3) {
    return {
      strategy: "add_wait",
      reason: `Task type "${task.type}" has failed ${typeFailures} times. Adding wait before retry.`
    };
  }

  return null;
}

/**
 * Get a summary of what was learned during the run.
 */
export function getRunTimeLearnings(state: OnlineAdapterState): string {
  if (state.lessons.length === 0) return "No in-run adaptations were needed.";

  const lines = state.lessons.map(
    l => `- ${l.taskType}${l.selector ? ` (${l.selector})` : ""}: ${l.suggestedStrategy}`
  );
  return `In-run learnings (${state.lessons.length}):\n${lines.join("\n")}`;
}

function inferStrategy(
  task: AgentTask,
  selector: string,
  state: OnlineAdapterState
): string {
  const selectorFailures = selector ? (state.failedSelectors.get(selector) ?? 0) : 0;
  const typeFailures = state.failedTaskTypes.get(task.type) ?? 0;

  // Multiple failures with same selector → switch to visual
  if (selectorFailures >= 2 && (task.type === "click" || task.type === "type")) {
    return `use visual_${task.type} instead of CSS selector`;
  }

  // Selector not found type errors → try visual fallback
  if (task.type === "click" || task.type === "type" || task.type === "select") {
    return "try visual fallback or alternative selector";
  }

  // Assert failures → add wait before assert
  if (task.type === "assert_text") {
    return "add wait before assertion (page may still be loading)";
  }

  // Generic
  if (typeFailures >= 2) {
    return "reduce action speed or add defensive waits";
  }

  return "retry with current strategy";
}
