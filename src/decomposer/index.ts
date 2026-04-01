/**
 * Goal Decomposer — breaks complex goals into ordered sub-goals.
 *
 * For goals that contain multiple independent objectives connected by
 * "then", "after", "finally", "next", etc., the decomposer splits them
 * into a sequential list. Each sub-goal is planned and executed independently,
 * with results chained together.
 *
 * This is a rule-based decomposer; an LLM-based version can be added later.
 */

export interface SubGoal {
  index: number;
  goal: string;
  dependsOn: number[]; // indices of sub-goals that must complete first
}

export interface DecompositionResult {
  decomposed: boolean;
  subGoals: SubGoal[];
  strategy: "sequential" | "single";
}

// Sentence-level separators indicating sequential steps
const SEQUENTIAL_SEPARATORS = /\s+(?:then|after that|next|afterwards|subsequently|finally|and then)\s+/gi;

// Indicators that a goal is inherently multi-step (not just a complex single task)
const MULTI_STEP_INDICATORS = /\b(then|after that|next step|step \d|first.*then|finally)\b/i;

export function decomposeGoal(goal: string): DecompositionResult {
  const trimmed = goal.trim();

  if (!MULTI_STEP_INDICATORS.test(trimmed)) {
    return { decomposed: false, subGoals: [{ index: 0, goal: trimmed, dependsOn: [] }], strategy: "single" };
  }

  const parts = trimmed
    .split(SEQUENTIAL_SEPARATORS)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (parts.length <= 1) {
    return { decomposed: false, subGoals: [{ index: 0, goal: trimmed, dependsOn: [] }], strategy: "single" };
  }

  const subGoals: SubGoal[] = parts.map((part, i) => ({
    index: i,
    goal: part,
    dependsOn: i > 0 ? [i - 1] : []
  }));

  return { decomposed: true, subGoals, strategy: "sequential" };
}

export function summarizeDecomposition(result: DecompositionResult): string {
  if (!result.decomposed) return result.subGoals[0].goal;
  return result.subGoals.map((sg, i) => `Step ${i + 1}: ${sg.goal}`).join("\n");
}
