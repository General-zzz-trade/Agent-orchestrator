import { AgentTask, PlanQualitySummary } from "../types";
import { validateTaskSemantics, validateTaskShape } from "./validation";

export function evaluatePlanQuality(goal: string, tasks: AgentTask[]): PlanQualitySummary {
  const issues: string[] = [];
  const has = (type: AgentTask["type"]): boolean => tasks.some((task) => task.type === type);
  const firstIndex = (type: AgentTask["type"]): number => tasks.findIndex((task) => task.type === type);
  const mentions = (pattern: RegExp): boolean => pattern.test(goal);

  if (tasks.length === 0) {
    return {
      complete: false,
      score: 0,
      quality: "low",
      issues: ["No tasks were produced."]
    };
  }

  if (has("start_app") && !has("wait_for_server")) {
    issues.push("start_app is missing wait_for_server.");
  }

  if (has("start_app") && has("stop_app") && firstIndex("stop_app") < firstIndex("start_app")) {
    issues.push("stop_app appears before start_app.");
  }

  if (has("click") && !has("open_page")) {
    issues.push("click is missing open_page before interaction.");
  }

  if (has("open_page") && has("wait_for_server") && has("start_app") && firstIndex("open_page") < firstIndex("wait_for_server")) {
    issues.push("open_page appears before wait_for_server.");
  }

  if (has("assert_text") && !has("open_page")) {
    issues.push("assert_text is missing open_page before assertion.");
  }

  if (has("assert_text") && !has("click") && mentions(/dashboard|login|submit|confirm/i)) {
    issues.push("assert_text may be missing a prior UI action for goal-dependent state.");
  }

  if (has("start_app") && !has("stop_app")) {
    issues.push("start_app is missing stop_app cleanup.");
  }

  if (firstIndex("start_app") >= 0 && firstIndex("wait_for_server") >= 0 && firstIndex("wait_for_server") < firstIndex("start_app")) {
    issues.push("wait_for_server appears before start_app.");
  }

  if (firstIndex("click") >= 0 && firstIndex("open_page") >= 0 && firstIndex("click") < firstIndex("open_page")) {
    issues.push("click appears before open_page.");
  }

  if (firstIndex("assert_text") >= 0 && firstIndex("open_page") >= 0 && firstIndex("assert_text") < firstIndex("open_page")) {
    issues.push("assert_text appears before open_page.");
  }

  if (has("assert_text") && has("click") && firstIndex("assert_text") < firstIndex("click")) {
    issues.push("assert_text appears before click.");
  }

  if (mentions(/screenshot|capture/i) && !has("screenshot")) {
    issues.push("Goal mentions screenshot but plan does not include it.");
  }

  if (mentions(/assert|verify|prove/i) && !has("assert_text")) {
    issues.push("Goal expects verification but plan does not include assert_text.");
  }

  if (mentions(/open|visit|go to|page|site/i) && !has("open_page")) {
    issues.push("Goal expects navigation but plan does not include open_page.");
  }

  let score = 100;
  for (const issue of issues) {
    if (issue.includes("missing")) {
      score -= 20;
      continue;
    }

    if (issue.includes("appears before")) {
      score -= 18;
      continue;
    }

    score -= 12;
  }

  score = Math.max(0, score);

  const complete = !issues.some((issue) => issue.includes("missing")) && score >= 60;
  const quality = score >= 85 ? "high" : score >= 60 ? "medium" : "low";

  return {
    complete,
    score,
    quality,
    issues
  };
}

export function evaluateTaskSequenceQuality(goal: string, tasks: AgentTask[]): PlanQualitySummary {
  const base = evaluatePlanQuality(goal, tasks);
  const semantic = validateTaskSemantics(tasks);
  const shape = validateTaskShape(tasks);
  const mergedIssues = [...base.issues, ...shape.issues, ...semantic.issues];

  if (mergedIssues.length === 0) {
    return base;
  }

  const score = Math.max(0, base.score - shape.issues.length * 25 - semantic.issues.length * 15);
  return {
    complete: base.complete && shape.valid && semantic.valid,
    score,
    quality: score >= 85 ? "high" : score >= 60 ? "medium" : "low",
    issues: mergedIssues
  };
}
