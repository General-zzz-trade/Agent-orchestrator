import { retrieveRecoveryPriors, retrieveRelevantKnowledge } from "./store";
import type { FailureLessonEntry } from "./types";

export interface PlanningPrior {
  taskType: string;
  lessons: FailureLessonEntry[];
}

export function buildKnowledgeContext(goal: string, domain?: string): string {
  const knowledge = retrieveRelevantKnowledge(goal, domain);
  const planningPriors = buildPlanningPriors(goal, domain);
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
      const hypothesis = l.hypothesisKind ? ` | hypothesis=${l.hypothesisKind}` : "";
      const transition = l.stateTransition ? ` | state=${l.stateTransition}` : "";
      const sequence = l.recoverySequence && l.recoverySequence.length > 0
        ? ` | steps=${l.recoverySequence.join(" -> ")}`
        : "";
      parts.push(`  - ${l.taskType} failed with "${l.errorPattern}" → recovery: ${l.recovery}${hypothesis}${transition}${sequence}`);
    }
  }

  if (planningPriors.length > 0) {
    parts.push("Procedural priors for likely task types:");
    for (const prior of planningPriors) {
      const lessons = prior.lessons
        .map((lesson) => {
          const hypothesis = lesson.hypothesisKind ? ` hypothesis=${lesson.hypothesisKind}` : "";
          const steps = lesson.recoverySequence?.length ? ` steps=${lesson.recoverySequence.join(" -> ")}` : "";
          return `${lesson.recovery}${hypothesis}${steps}`;
        })
        .join(" ; ");
      parts.push(`  - ${prior.taskType}: ${lessons}`);
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

export function buildPlanningPriors(goal: string, domain?: string): PlanningPrior[] {
  const taskTypes = inferLikelyTaskTypes(goal);
  return taskTypes
    .map((taskType) => ({
      taskType,
      lessons: retrieveRecoveryPriors(taskType, { domain, limit: 2 })
    }))
    .filter((entry) => entry.lessons.length > 0);
}

export function inferLikelyTaskTypes(goal: string): string[] {
  const normalized = goal.toLowerCase();
  const taskTypes = new Set<string>();

  if (/open|visit|go to|page|url|website/.test(normalized)) {
    taskTypes.add("open_page");
  }

  if (/click|press|tap|login button|submit button/.test(normalized)) {
    taskTypes.add("click");
  }

  if (/type|enter|fill|input|password|email|username/.test(normalized)) {
    taskTypes.add("type");
  }

  if (/select|choose|dropdown|option/.test(normalized)) {
    taskTypes.add("select");
  }

  if (/assert|confirm|verify|appears|visible|dashboard|text/.test(normalized)) {
    taskTypes.add("assert_text");
  }

  return [...taskTypes];
}

export function extractDomainFromGoal(goal: string): string | undefined {
  const match = goal.match(/https?:\/\/([^/"\s]+)/i);
  return match?.[1];
}
