import { runGoal } from "../core/runtime";
import { setRunStatus, clearRunStatus } from "../api/run-store";
import { JobQueue, JobRequest } from "./queue";

const DEFAULT_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

let _queue: JobQueue | null = null;

export function getQueue(): JobQueue {
  if (_queue) return _queue;

  _queue = new JobQueue(DEFAULT_CONCURRENCY);
  _queue.setHandler(processJob);
  return _queue;
}

async function processJob(job: JobRequest): Promise<void> {
  setRunStatus(job.runId, "running");
  try {
    await runGoal(job.goal, job.options as never);
    setRunStatus(job.runId, "success");
  } catch {
    setRunStatus(job.runId, "failed");
  } finally {
    clearRunStatus(job.runId);
  }
}

export function submitJob(runId: string, goal: string, options: Record<string, unknown> = {}): void {
  const job: JobRequest = {
    runId,
    goal,
    options,
    submittedAt: new Date().toISOString()
  };
  setRunStatus(runId, "pending");
  getQueue().enqueue(job);
}
