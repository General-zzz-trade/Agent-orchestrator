import { FailurePattern } from "./memory";
import { AgentTask, RunMetrics, RunContext, TerminationReason } from "./types";

export interface RecentRunSummary {
  runId: string;
  goal: string;
  success: boolean;
  terminationReason?: TerminationReason;
  failedTaskTypes: AgentTask["type"][];
}

export interface LLMDiagnoserInput {
  goal: string;
  tasks: AgentTask[];
  metrics?: RunMetrics;
  failurePatterns: FailurePattern[];
  recentRunsSummary: RecentRunSummary[];
  terminationReason?: TerminationReason;
}

export interface LLMDiagnoserOutput {
  diagnosis: string;
  topRisks: string[];
  suggestedNextImprovements: string[];
}

export interface LLMDiagnoser {
  diagnose(input: LLMDiagnoserInput): Promise<LLMDiagnoserOutput>;
}

export function createDiagnoserFromEnv(): LLMDiagnoser | undefined {
  const provider = process.env.LLM_DIAGNOSER_PROVIDER;

  if (provider === "mock") {
    return createMockDiagnoser();
  }

  return undefined;
}

export function summarizeRecentRuns(runs: RunContext[]): RecentRunSummary[] {
  return runs.map((run) => ({
    runId: run.runId,
    goal: run.goal,
    success: run.result?.success ?? false,
    terminationReason: run.terminationReason,
    failedTaskTypes: run.tasks.filter((task) => task.status === "failed").map((task) => task.type)
  }));
}

function createMockDiagnoser(): LLMDiagnoser {
  return {
    async diagnose(input: LLMDiagnoserInput): Promise<LLMDiagnoserOutput> {
      const unstableTaskType = input.failurePatterns[0]?.taskType ?? "none";
      const diagnosis = `Mock LLM diagnosis: termination=${input.terminationReason ?? "unknown"}, unstableTaskType=${unstableTaskType}, recentRuns=${input.recentRunsSummary.length}.`;

      const topRisks = [
        `Most unstable task type: ${unstableTaskType}`,
        `Run ended with: ${input.terminationReason ?? "unknown"}`
      ];

      const suggestedNextImprovements = [
        "Stabilize selectors and readiness checks before increasing automation scope.",
        "Review recent failed runs and compare task timing against successful runs."
      ];

      return {
        diagnosis,
        topRisks,
        suggestedNextImprovements
      };
    }
  };
}
