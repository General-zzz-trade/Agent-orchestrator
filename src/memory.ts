import { AgentTask, RunContext } from "./types";
import { upsertRun, getRun, listRuns, findFailurePatterns as dbFindFailurePatterns } from "./db/runs-repo";

export interface FailurePattern {
  taskType: AgentTask["type"];
  count: number;
  latestMessages: string[];
}

export async function saveRun(context: RunContext): Promise<string> {
  upsertRun(context);
  return context.runId;
}

export async function loadRecentRuns(limit: number): Promise<RunContext[]> {
  return listRuns(limit);
}

export async function findRunsByTaskType(type: AgentTask["type"]): Promise<RunContext[]> {
  return listRuns(500).then(runs => runs.filter(r => r.tasks.some(t => t.type === type)));
}

export async function findFailurePatterns(): Promise<FailurePattern[]> {
  return dbFindFailurePatterns();
}

export async function getPlanningSnapshot(limit: number): Promise<{
  recentRuns: RunContext[];
  failurePatterns: FailurePattern[];
}> {
  const [recentRuns, failurePatterns] = await Promise.all([
    loadRecentRuns(limit),
    findFailurePatterns()
  ]);
  return { recentRuns, failurePatterns };
}

export { getRun };
