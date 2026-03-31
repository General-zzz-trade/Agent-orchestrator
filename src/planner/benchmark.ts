import { createServer } from "node:http";
import { runGoal } from "../core/runtime";
import { PlannerMode } from ".";

interface PlannerStats {
  runs: number;
  successes: number;
  totalTaskCount: number;
  totalReplans: number;
  totalRetries: number;
  totalQualityScore: number;
  llmInvocations: number;
  timeoutCount: number;
  fallbackCount: number;
  chosenCounts: Record<string, number>;
  ledgerPlannerCalls: number;
  ledgerReplannerCalls: number;
  ledgerDiagnoserCalls: number;
}

interface RecoveryStats {
  runs: number;
  recoveries: number;
  totalInsertedTasks: number;
  totalRetries: number;
  llmReplannerInvocations: number;
  fallbackCount: number;
  ledgerSummary: number;
}

type Category = "explicit" | "semi-natural" | "ambiguous";

async function main(): Promise<void> {
  await runPlanningBenchmark();
  await runRecoveryBenchmark();
}

async function runPlanningBenchmark(): Promise<void> {
  const planners: PlannerMode[] = ["auto", "template", "regex", "llm"];
  const stats = new Map<string, PlannerStats>();
  const categories: Category[] = ["explicit", "semi-natural", "ambiguous"];

  for (const category of categories) {
    for (const planner of planners) {
      stats.set(`${category}:${planner}`, createEmptyPlannerStats());
    }
  }

  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const command = `tsx src/sample-app/server.ts ${port}`;

  const goals: Array<{ category: Category; goal: string }> = [
    {
      category: "explicit",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}" and assert text "Logged out" and stop app`
    },
    {
      category: "explicit",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}" and click "#login-button" and assert text "Dashboard" and screenshot to artifacts/benchmark-login.png and stop app`
    },
    {
      category: "semi-natural",
      goal: `launch local app using "${command}" then wait until "${url}" is ready and open "${url}" and press delayed login and confirm "Dashboard" appears then capture screenshot and stop app`
    },
    {
      category: "semi-natural",
      goal: `use "${command}" to boot the app, make sure "${url}" is reachable, visit it, hit the delayed login button, verify the dashboard text, and save a screenshot`
    },
    {
      category: "ambiguous",
      goal: `boot app "${command}" and when "${url}" responds go there, make delayed login work, prove dashboard shows up, capture it, then shut everything down`
    },
    {
      category: "ambiguous",
      goal: `start whatever is needed with "${command}", get to "${url}", complete login, verify success, and leave evidence`
    }
  ];

  for (const planner of planners) {
    for (const item of goals) {
      if (planner === "llm" && !process.env.LLM_PLANNER_PROVIDER) {
        continue;
      }

      const run = await runGoal(item.goal, {
        plannerMode: planner,
        maxReplansPerRun: 2,
        maxReplansPerTask: 1,
        maxLLMPlannerCalls: planner === "auto" || planner === "llm" ? 1 : 0
      });

      const entry = stats.get(`${item.category}:${planner}`);
      if (!entry) {
        continue;
      }

      entry.runs += 1;
      entry.successes += run.result?.success ? 1 : 0;
      entry.totalTaskCount += run.tasks.length;
      entry.totalReplans += run.metrics?.totalReplans ?? 0;
      entry.totalRetries += run.metrics?.totalRetries ?? 0;
      entry.totalQualityScore += run.plannerDecisionTrace?.qualityScore ?? 0;
      entry.llmInvocations += run.plannerDecisionTrace?.llmInvocations ?? 0;
      entry.timeoutCount += run.plannerDecisionTrace?.timeoutCount ?? 0;
      entry.fallbackCount += run.plannerDecisionTrace?.fallbackReason ? 1 : 0;
      entry.ledgerPlannerCalls += run.usageLedger?.plannerCalls ?? 0;
      entry.ledgerReplannerCalls += run.usageLedger?.replannerCalls ?? 0;
      entry.ledgerDiagnoserCalls += run.usageLedger?.diagnoserCalls ?? 0;

      const chosenPlanner = run.plannerDecisionTrace?.chosenPlanner ?? "none";
      entry.chosenCounts[chosenPlanner] = (entry.chosenCounts[chosenPlanner] ?? 0) + 1;
    }
  }

  console.log("planning benchmark:");
  for (const category of categories) {
    console.log(`${category}:`);
    for (const planner of planners) {
      const entry = stats.get(`${category}:${planner}`);
      if (!entry || entry.runs === 0) {
        console.log(`  ${planner}: skipped`);
        continue;
      }

      console.log(`  ${planner}:`);
      console.log(`    planner chosen: ${formatChosenCounts(entry.chosenCounts)}`);
      console.log(`    success rate: ${(entry.successes / entry.runs).toFixed(2)}`);
      console.log(`    average quality score: ${(entry.totalQualityScore / entry.runs).toFixed(2)}`);
      console.log(`    average task count: ${(entry.totalTaskCount / entry.runs).toFixed(2)}`);
      console.log(`    average replans: ${(entry.totalReplans / entry.runs).toFixed(2)}`);
      console.log(`    average retries: ${(entry.totalRetries / entry.runs).toFixed(2)}`);
      console.log(`    llm invocation count: ${entry.llmInvocations}`);
      console.log(`    timeout count: ${entry.timeoutCount}`);
      console.log(`    fallback count: ${entry.fallbackCount}`);
      console.log(`    usage ledger summary: planner=${entry.ledgerPlannerCalls}, replanner=${entry.ledgerReplannerCalls}, diagnoser=${entry.ledgerDiagnoserCalls}`);
    }
  }
}

async function runRecoveryBenchmark(): Promise<void> {
  const modes = ["rules-only", "llm-replanner-enabled"] as const;
  const stats = new Map<(typeof modes)[number], RecoveryStats>();
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const command = `tsx src/sample-app/server.ts ${port}`;
  const recoveryGoal =
    `start app "${command}" and wait for server "${url}" and open page "${url}" and click "#login-button" and assert text "Wrong Dashboard" timeout 1 second and stop app`;

  for (const mode of modes) {
    stats.set(mode, {
      runs: 0,
      recoveries: 0,
      totalInsertedTasks: 0,
      totalRetries: 0,
      llmReplannerInvocations: 0,
      fallbackCount: 0
      ,
      ledgerSummary: 0
    });

    if (mode === "llm-replanner-enabled" && !process.env.LLM_REPLANNER_PROVIDER) {
      continue;
    }

    const run = await runGoal(recoveryGoal, {
      plannerMode: "auto",
      maxReplansPerRun: 2,
      maxReplansPerTask: 1,
      maxLLMPlannerCalls: 0,
      maxLLMReplannerCalls: mode === "llm-replanner-enabled" ? 1 : 0,
      maxLLMReplannerTimeouts: 1
    });

    const entry = stats.get(mode);
    if (!entry) {
      continue;
    }

    entry.runs += 1;
    entry.recoveries += run.result?.success ? 1 : 0;
    entry.totalInsertedTasks += run.insertedTaskCount;
    entry.totalRetries += run.metrics?.totalRetries ?? 0;
    entry.llmReplannerInvocations += run.llmReplannerInvocations;
    entry.fallbackCount += run.llmReplannerFallbackCount;
    entry.ledgerSummary += run.usageLedger?.totalLLMInteractions ?? 0;
  }

  console.log("");
  console.log("recovery benchmark:");
  for (const mode of modes) {
    const entry = stats.get(mode);
    if (!entry || entry.runs === 0) {
      console.log(`  ${mode}: skipped`);
      continue;
    }

    console.log(`  ${mode}:`);
    console.log(`    recovery success rate: ${(entry.recoveries / entry.runs).toFixed(2)}`);
    console.log(`    average inserted tasks: ${(entry.totalInsertedTasks / entry.runs).toFixed(2)}`);
    console.log(`    average retries: ${(entry.totalRetries / entry.runs).toFixed(2)}`);
    console.log(`    llm replanner invocation count: ${entry.llmReplannerInvocations}`);
    console.log(`    fallback count: ${entry.fallbackCount}`);
    console.log(`    usage ledger summary: totalLLMInteractions=${entry.ledgerSummary}`);
  }
}

function createEmptyPlannerStats(): PlannerStats {
  return {
    runs: 0,
    successes: 0,
    totalTaskCount: 0,
    totalReplans: 0,
    totalRetries: 0,
    totalQualityScore: 0,
    llmInvocations: 0,
    timeoutCount: 0,
    fallbackCount: 0,
    chosenCounts: {},
    ledgerPlannerCalls: 0,
    ledgerReplannerCalls: 0,
    ledgerDiagnoserCalls: 0
  };
}

function formatChosenCounts(chosenCounts: Record<string, number>): string {
  const entries = Object.entries(chosenCounts);
  if (entries.length === 0) {
    return "none";
  }

  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([planner, count]) => `${planner}=${count}`)
    .join(", ");
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate a benchmark port.");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  return address.port;
}

void main();
