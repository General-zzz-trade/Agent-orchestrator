// Tracks live run status before DB flush
const activeRuns = new Map<string, "pending" | "running" | "success" | "failed">();

export function setRunStatus(runId: string, status: "pending" | "running" | "success" | "failed"): void {
  activeRuns.set(runId, status);
}

export function getRunStatus(runId: string): string | null {
  return activeRuns.get(runId) ?? null;
}

export function clearRunStatus(runId: string): void {
  activeRuns.delete(runId);
}
