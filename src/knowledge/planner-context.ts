import { retrieveRelevantKnowledge } from "./store";

export function buildKnowledgeContext(goal: string, domain?: string): string {
  const knowledge = retrieveRelevantKnowledge(goal, domain);
  const parts: string[] = [];

  if (knowledge.selectors.length > 0) {
    const top = knowledge.selectors.slice(0, 5);
    parts.push("Known selectors for this domain:");
    for (const s of top) {
      parts.push(`  - "${s.description}" → ${s.selector} (success rate: ${Math.round(s.successCount / Math.max(1, s.successCount + s.failureCount) * 100)}%)`);
    }
  }

  if (knowledge.lessons.length > 0) {
    const top = knowledge.lessons.slice(0, 5);
    parts.push("Past failure lessons:");
    for (const l of top) {
      parts.push(`  - ${l.taskType} failed with "${l.errorPattern}" → recovery: ${l.recovery}`);
    }
  }

  if (knowledge.templates.length > 0) {
    const top = knowledge.templates.slice(0, 3);
    parts.push("Similar task templates from past runs:");
    for (const t of top) {
      parts.push(`  - Goal pattern: "${t.goalPattern}" → ${t.tasksSummary}`);
    }
  }

  if (parts.length === 0) return "";
  return "\n\n[Knowledge Base Context]\n" + parts.join("\n");
}

export function extractDomainFromGoal(goal: string): string | undefined {
  const match = goal.match(/https?:\/\/([^/\s]+)/i);
  return match?.[1];
}
