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

void main();
