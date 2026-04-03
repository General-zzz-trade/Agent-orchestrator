import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RunContext } from "./types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Support: inspect-run <path>  OR  inspect-run --run <id>
  let inputPath: string | undefined;

  if (args[0] === "--run" && args[1]) {
    inputPath = `artifacts/runs/${args[1]}.json`;
  } else {
    inputPath = args[0];
  }

  if (!inputPath) {
    console.error('Usage: tsx src/inspect-run.ts "<run-json-path>"');
    console.error('       tsx src/inspect-run.ts --run <run-id>');
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), inputPath);
  const content = await readFile(absolutePath, "utf-8");
  const run = JSON.parse(content) as RunContext;

  printHeader(run);
  printTaskTimeline(run);
  printDecisionChain(run);
  printCognition(run);
  printMetrics(run);
  printReflection(run);
}

function printHeader(run: RunContext): void {
  const status = run.result?.success ? "SUCCESS" : "FAILED";
  const duration = run.startedAt && run.endedAt
    ? `${((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`
    : "unknown";

  console.log("=".repeat(60));
  console.log(`Run: ${run.runId}  [${status}]  duration=${duration}`);
  console.log(`Goal: ${run.goal}`);
  console.log(`Planner: ${run.plannerUsed ?? "unknown"}  |  Policy: ${run.policy?.mode ?? "unknown"}  |  Termination: ${run.terminationReason ?? "unknown"}`);
  console.log("=".repeat(60));
  console.log();
}

function printTaskTimeline(run: RunContext): void {
  if (run.tasks.length === 0) {
    console.log("Tasks: (none)");
    console.log();
    return;
  }

  console.log("Task Timeline:");

  const maxTypeLen = Math.max(...run.tasks.map((t) => t.type.length));

  for (const task of run.tasks) {
    const icon = task.status === "done" ? "✓" : task.status === "failed" ? "✗" : task.status === "running" ? "→" : "·";
    const typeCol = task.type.padEnd(maxTypeLen);
    const durationCol = task.durationMs != null ? `${task.durationMs}ms`.padStart(7) : "       ";
    const retriesCol = task.retries > 0 ? ` retries=${task.retries}` : "";
    const replanCol = task.replanDepth > 0 ? ` replan=${task.replanDepth}` : "";
    const errorCol = task.status === "failed" && task.error ? `  → ${task.error.slice(0, 80)}` : "";

    console.log(`  ${icon} ${typeCol}  ${durationCol}${retriesCol}${replanCol}${errorCol}`);
  }

  const done = run.tasks.filter((t) => t.status === "done").length;
  const failed = run.tasks.filter((t) => t.status === "failed").length;
  console.log(`  ${done}/${run.tasks.length} completed, ${failed} failed, ${run.replanCount} replan(s)`);
  console.log();
}

function printDecisionChain(run: RunContext): void {
  // Planner decision summary
  if (run.plannerDecisionTrace) {
    const trace = run.plannerDecisionTrace;
    console.log("Planner Decision:");
    console.log(`  Chosen: ${trace.chosenPlanner}  |  Quality: ${trace.qualitySummary.quality} (score=${trace.qualityScore})  |  Goal category: ${trace.goalCategory}`);
    if (trace.chosenPriorAwarePlanning?.applied) {
      const priorSummary = trace.chosenPriorAwarePlanning.matchedPriors
        .map((prior) => `${prior.taskType}:${prior.recovery}${prior.hypothesisKind ? ` (${prior.hypothesisKind})` : ""}`)
        .join(" ; ");
      console.log(`  Prior-aware rewrite: tasks ${trace.chosenPriorAwarePlanning.originalTaskCount} -> ${trace.chosenPriorAwarePlanning.rewrittenTaskCount}  |  quality delta=${trace.chosenPriorAwarePlanning.qualityDelta ?? 0}`);
      console.log(`  Matched priors: ${priorSummary}`);
      if (trace.chosenPriorAwarePlanning.notes.length > 0) {
        console.log(`  Rewrites: ${trace.chosenPriorAwarePlanning.notes.join(" | ")}`);
      }
    }
    if (trace.llmUsageRationale) {
      console.log(`  LLM used because: ${trace.llmUsageRationale}`);
    }
    if (trace.fallbackReason) {
      console.log(`  Fallback reason: ${trace.fallbackReason}`);
    }
    if (trace.qualitySummary.issues.length > 0) {
      console.log(`  Quality issues: ${trace.qualitySummary.issues.join("; ")}`);
    }
    console.log();
  }

  // Escalation decisions
  const decisions = run.escalationDecisions ?? [];
  if (decisions.length === 0) {
    return;
  }

  console.log("Escalation Decisions:");
  for (const d of decisions) {
    const usedLLM = d.decision.useLLMPlanner || d.decision.useLLMReplanner || d.decision.useLLMDiagnoser;
    const outcome = d.decision.abortEarly ? "ABORT" : usedLLM ? "LLM" : "RULES";
    const taskCol = d.taskId ? ` task=${d.taskId}` : "";
    const failureCol = d.currentFailureType !== "none" ? ` failure=${d.currentFailureType}` : "";
    const rationale = d.decision.llmUsageRationale ?? d.decision.fallbackRationale ?? d.decision.rationale.at(-1) ?? "";

    console.log(`  [${d.stage.padEnd(9)}] ${outcome.padEnd(6)}${taskCol}${failureCol}`);
    if (rationale) {
      console.log(`             → ${rationale}`);
    }
  }
  console.log();

  const priorAwareCandidates = decisions.length >= 0 && run.plannerDecisionTrace?.candidatePlanners
    .filter((candidate) => candidate.priorAwarePlanning?.applied);
  if (priorAwareCandidates && priorAwareCandidates.length > 0) {
    console.log("Prior-aware candidates:");
    for (const candidate of priorAwareCandidates) {
      const priorAware = candidate.priorAwarePlanning!;
      console.log(
        `  [${candidate.planner}] tasks ${priorAware.originalTaskCount} -> ${priorAware.rewrittenTaskCount} quality delta=${priorAware.qualityDelta ?? 0}`
      );
      if (priorAware.notes.length > 0) {
        console.log(`             rewrites: ${priorAware.notes.join(" | ")}`);
      }
    }
    console.log();
  }
}

function printMetrics(run: RunContext): void {
  if (!run.metrics && !run.usageLedger) {
    return;
  }

  console.log("Metrics & Usage:");
  if (run.metrics) {
    const m = run.metrics;
    console.log(`  Tasks: total=${m.totalTasks} done=${m.doneTasks} failed=${m.failedTasks} retries=${m.totalRetries} replans=${m.totalReplans} avgDuration=${m.averageTaskDurationMs}ms`);
  }
  if (run.usageLedger) {
    const u = run.usageLedger;
    console.log(`  LLM calls: planner=${u.llmPlannerCalls} replanner=${u.llmReplannerCalls} diagnoser=${u.llmDiagnoserCalls} total=${u.totalLLMInteractions}`);
    if (u.plannerTimeouts + u.replannerTimeouts + u.diagnoserTimeouts > 0) {
      console.log(`  Timeouts: planner=${u.plannerTimeouts} replanner=${u.replannerTimeouts} diagnoser=${u.diagnoserTimeouts}`);
    }
    if (u.plannerFallbacks + u.replannerFallbacks > 0) {
      console.log(`  Fallbacks: planner=${u.plannerFallbacks} replanner=${u.replannerFallbacks}`);
    }
  }
  console.log();
}

function printCognition(run: RunContext): void {
  const hasCognition = Boolean(
    run.worldState ||
      (run.observations && run.observations.length > 0) ||
      run.latestObservation ||
      (run.hypotheses && run.hypotheses.length > 0) ||
      (run.experimentResults && run.experimentResults.length > 0) ||
      (run.beliefUpdates && run.beliefUpdates.length > 0) ||
      (run.verificationResults && run.verificationResults.length > 0) ||
      (run.cognitiveDecisions && run.cognitiveDecisions.length > 0) ||
      (run.episodeEvents && run.episodeEvents.length > 0)
  );

  if (!hasCognition) {
    return;
  }

  console.log("Cognition:");
  printCognitionOverview(run);
  printWorldStateHistory(run);
  printHypothesisTrail(run);
  printVerificationSummary(run);
  printObservationTrail(run);
  printEpisodeTimeline(run);
  console.log();
}

function printWorldStateHistory(run: RunContext): void {
  const history = run.worldStateHistory ?? (run.worldState ? [run.worldState] : []);
  if (history.length === 0) {
    return;
  }

  console.log("  World state timeline:");
  for (const state of history.slice(-8)) {
    const pageCol = state.pageUrl ? ` page=${trimForConsole(state.pageUrl, 48)}` : "";
    const actionCol = state.lastAction ? ` action=${state.lastAction}` : "";
    const sourceCol = state.source ? ` source=${state.source}` : "";
    const reasonCol = state.reason ? ` reason=${trimForConsole(state.reason, 42)}` : "";
    console.log(
      `    state=${state.appState} uncertainty=${state.uncertaintyScore.toFixed(2)}${actionCol}${sourceCol}${reasonCol}${pageCol}`
    );
  }
}

function printCognitionOverview(run: RunContext): void {
  if (run.worldState) {
    console.log(`  World state: appState=${run.worldState.appState} uncertainty=${run.worldState.uncertaintyScore}`);
    if (run.worldState.pageUrl) {
      console.log(`  Page: ${run.worldState.pageUrl}`);
    }
    if (run.worldState.facts.length > 0) {
      console.log(`  Facts: ${run.worldState.facts.slice(0, 5).join(" | ")}`);
    }
  }

  if (run.latestObservation) {
    const observation = run.latestObservation;
    console.log(`  Latest observation: confidence=${observation.confidence} anomalies=${observation.anomalies.length}`);
    if (observation.title) {
      console.log(`  Title: ${observation.title}`);
    }
    if (observation.visibleText && observation.visibleText.length > 0) {
        console.log(`  Visible text: ${observation.visibleText.slice(0, 3).join(" / ")}`);
      }
    }
}

function printVerificationSummary(run: RunContext): void {
  const verificationResults = run.verificationResults ?? [];
  if (verificationResults.length === 0) {
    return;
  }

  const byVerifier = new Map<string, { pass: number; fail: number }>();
  for (const verification of verificationResults) {
    const current = byVerifier.get(verification.verifier) ?? { pass: 0, fail: 0 };
    if (verification.passed) {
      current.pass += 1;
    } else {
      current.fail += 1;
    }
    byVerifier.set(verification.verifier, current);
  }

  console.log("  Verification summary:");
  for (const [verifier, stats] of byVerifier) {
    console.log(`    ${verifier}: pass=${stats.pass} fail=${stats.fail}`);
  }
  for (const verification of verificationResults.filter((item) => !item.passed).slice(-5)) {
    console.log(
      `    fail task=${verification.taskId ?? "run"} [${verification.verifier}] confidence=${verification.confidence} -> ${verification.rationale}`
    );
  }
}

function printHypothesisTrail(run: RunContext): void {
  const hypotheses = run.hypotheses ?? [];
  const experimentResults = run.experimentResults ?? [];
  const beliefUpdates = run.beliefUpdates ?? [];

  if (hypotheses.length === 0 && experimentResults.length === 0 && beliefUpdates.length === 0) {
    return;
  }

  console.log("  Recovery analysis:");

  for (const hypothesis of hypotheses.slice(-5)) {
    console.log(
      `    hypothesis ${hypothesis.kind} confidence=${hypothesis.confidence.toFixed(2)} -> ${trimForConsole(hypothesis.explanation, 95)}`
    );
  }

  for (const result of experimentResults.slice(-5)) {
    console.log(
      `    experiment ${result.outcome} delta=${result.confidenceDelta.toFixed(2)} action=${trimForConsole(result.performedAction ?? "none", 42)} -> ${trimForConsole(result.experiment, 95)}`
    );
  }

  for (const update of beliefUpdates.slice(-5)) {
    console.log(
      `    belief ${update.previousConfidence.toFixed(2)} -> ${update.nextConfidence.toFixed(2)} for ${trimForConsole(update.hypothesisId, 40)}`
    );
  }
}

function printObservationTrail(run: RunContext): void {
  const observations = run.observations ?? (run.latestObservation ? [run.latestObservation] : []);
  if (observations.length === 0) {
    return;
  }

  console.log("  Observation trail:");
  for (const observation of observations.slice(-5)) {
    const taskCol = observation.taskId ? ` task=${observation.taskId}` : "";
    const sourceCol = ` source=${observation.source}`;
    const urlCol = observation.pageUrl ? ` url=${trimForConsole(observation.pageUrl, 60)}` : "";
    const titleCol = observation.title ? ` title=${trimForConsole(observation.title, 40)}` : "";
    const anomalyCol = observation.anomalies.length > 0
      ? ` anomalies=${trimForConsole(observation.anomalies.join(" | "), 80)}`
      : "";
    console.log(`    obs confidence=${observation.confidence}${taskCol}${sourceCol}${urlCol}${titleCol}${anomalyCol}`);
  }
}

function printEpisodeTimeline(run: RunContext): void {
  const events = run.episodeEvents ?? [];
  if (events.length === 0) {
    return;
  }

  console.log("  Episode timeline:");
  for (const event of events.slice(-12)) {
    const taskCol = event.taskId ? ` task=${event.taskId}` : "";
    const verificationCol = event.verificationPassed === undefined
      ? ""
      : ` verify=${event.verificationPassed ? "pass" : "fail"}`;
    const nextAction = event.metadata?.["nextAction"];
    const actionCol = typeof nextAction === "string" ? ` next=${nextAction}` : "";
    console.log(`    [${event.kind}]${taskCol}${verificationCol}${actionCol} -> ${trimForConsole(event.summary, 110)}`);
  }
}

function printReflection(run: RunContext): void {
  if (!run.reflection) {
    return;
  }

  const r = run.reflection;
  console.log("Reflection:");
  console.log(`  ${r.summary}`);
  console.log();
  console.log("  Diagnosis:");
  console.log(`  ${r.diagnosis}`);

  if (r.topRisks && r.topRisks.length > 0) {
    console.log();
    console.log("  Top Risks:");
    for (const risk of r.topRisks) {
      console.log(`    • ${risk}`);
    }
  }

  if (r.improvementSuggestions.length > 0) {
    console.log();
    console.log("  Improvement Suggestions:");
    for (const suggestion of r.improvementSuggestions) {
      console.log(`    • ${suggestion}`);
    }
  }

  console.log();
}

function trimForConsole(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

void main();
