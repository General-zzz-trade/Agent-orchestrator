/**
 * Ambiguity detector — determines if a goal needs clarification before planning.
 */

export interface ClarificationNeeded {
  needed: boolean;
  question?: string;
  ambiguityReason?: string;
}

const AMBIGUOUS_PATTERNS: Array<{ pattern: RegExp; question: string }> = [
  {
    pattern: /\b(something|stuff|things|it|this|that)\b/i,
    question: "What specifically should I work on? Please provide more details."
  },
  {
    pattern: /^(run|start|launch|open|go to|navigate)\s*$/i,
    question: "What should I run/open? Please provide a URL, app name, or command."
  },
  {
    pattern: /^(help|do|handle|process|manage|fix|check|update|get|make)\s+\w+(\s+\w+){0,2}$/i,
    question: "Could you be more specific? What exactly would you like me to do, and where?"
  }
];

const ACTION_KEYWORDS = /\b(open|click|type|navigate|go to|fill|submit|assert|check|verify|scroll|hover|run|execute|start|wait|screenshot|extract|select|download|upload)\b/i;

export function detectAmbiguity(goal: string): ClarificationNeeded {
  const trimmed = goal.trim();

  if (trimmed.length < 10) {
    return {
      needed: true,
      question: "Your goal is very brief. Could you describe what you want the agent to do in more detail?",
      ambiguityReason: "goal_too_short"
    };
  }

  const hasUrl = /https?:\/\//i.test(trimmed);
  const hasAction = ACTION_KEYWORDS.test(trimmed);

  if (!hasUrl && !hasAction && trimmed.split(/\s+/).length < 6) {
    return {
      needed: true,
      question: `I'm not sure how to proceed with "${trimmed}". Could you describe the steps, e.g. "open http://... and click ..."?`,
      ambiguityReason: "no_actionable_keywords"
    };
  }

  for (const { pattern, question } of AMBIGUOUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { needed: true, question, ambiguityReason: "matched_ambiguous_pattern" };
    }
  }

  return { needed: false };
}
