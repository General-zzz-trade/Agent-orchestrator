import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AgentTask, RunContext } from "./types";

export interface FailurePattern {
  taskType: AgentTask["type"];
  count: number;
  latestMessages: string[];
}

export async function saveRun(context: RunContext): Promise<string> {
  const runsDir = getRunsDir();
  await mkdir(runsDir, { recursive: true });

  const outputPath = join(runsDir, `${context.runId}.json`);
  await writeFile(outputPath, JSON.stringify(context, null, 2), "utf-8");

  return outputPath;
}

export async function loadRecentRuns(limit: number): Promise<RunContext[]> {
  const runs = await readAllRuns();
  return runs
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, limit);
}

export async function findRunsByTaskType(type: AgentTask["type"]): Promise<RunContext[]> {
  const runs = await readAllRuns();
  return runs.filter((run) => run.tasks.some((task) => task.type === type));
}

export async function findFailurePatterns(): Promise<FailurePattern[]> {
  const runs = await readAllRuns();
  const failures = new Map<AgentTask["type"], FailurePattern>();

  for (const run of runs) {
    for (const task of run.tasks) {
      if (task.status !== "failed") {
        continue;
      }

      const current = failures.get(task.type) ?? {
        taskType: task.type,
        count: 0,
        latestMessages: []
      };

      current.count += 1;
      if (task.error) {
        current.latestMessages.push(task.error);
        current.latestMessages = current.latestMessages.slice(-3);
      }

      failures.set(task.type, current);
    }
  }

  return [...failures.values()].sort((left, right) => right.count - left.count);
}

export async function getPlanningSnapshot(limit: number): Promise<{
  recentRuns: RunContext[];
  failurePatterns: FailurePattern[];
}> {
  const [recentRuns, failurePatterns] = await Promise.all([
    loadRecentRuns(limit),
    findFailurePatterns()
  ]);

  return {
    recentRuns,
    failurePatterns
  };
}

async function readAllRuns(): Promise<RunContext[]> {
  const runsDir = getRunsDir();
  await mkdir(runsDir, { recursive: true });

  const files = await readdir(runsDir);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const runs = await Promise.all(
    jsonFiles.map(async (file) => {
      const content = await readFile(join(runsDir, file), "utf-8");
      return JSON.parse(content) as RunContext;
    })
  );

  return runs;
}

function getRunsDir(): string {
  return join(process.cwd(), "artifacts", "runs");
}
