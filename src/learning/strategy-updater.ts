/**
 * Strategy Updater — converts reflection insights into
 * actionable entries in the knowledge store.
 */

import { upsertLesson } from "../knowledge/store";
import type { ReflectionInsight } from "./reflection-loop";

/**
 * Apply reflection insights by creating synthetic failure lessons
 * that encode the learned strategies as high-confidence entries.
 */
export function applyInsights(insight: ReflectionInsight): number {
  let applied = 0;

  for (const { strategy, successCount } of insight.dominantRecoveryStrategies) {
    if (successCount < 3) continue;

    // Parse the strategy to determine task type
    const taskType = inferTaskTypeFromStrategy(strategy);
    if (!taskType) continue;

    // Create a synthetic high-confidence lesson
    upsertLesson({
      taskType,
      errorPattern: "any",
      recovery: strategy,
      successCount,
      hypothesisKind: "learned_pattern",
      domain: ""  // cross-domain
    });
    applied += 1;
  }

  return applied;
}

function inferTaskTypeFromStrategy(strategy: string): string | null {
  const lower = strategy.toLowerCase();
  if (lower.includes("visual_click") || lower.includes("click")) return "click";
  if (lower.includes("visual_type") || lower.includes("type")) return "type";
  if (lower.includes("wait")) return "assert_text";
  if (lower.includes("reopen") || lower.includes("navigate")) return "open_page";
  if (lower.includes("session") || lower.includes("login")) return "click";
  return null;
}
