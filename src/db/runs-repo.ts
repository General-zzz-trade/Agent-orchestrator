import { getDb } from "./client";
import { RunContext, AgentTask } from "../types";

interface RunRow {
  context_json: string;
}

export function upsertRun(ctx: RunContext, tenantId = "default"): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO runs (id, tenant_id, goal, status, planner_used, replan_count, started_at, ended_at,
      result_success, result_message, termination_reason, context_json)
    VALUES (@id, @tenant_id, @goal, @status, @planner_used, @replan_count, @started_at, @ended_at,
      @result_success, @result_message, @termination_reason, @context_json)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status, planner_used=excluded.planner_used,
      replan_count=excluded.replan_count, ended_at=excluded.ended_at,
      result_success=excluded.result_success, result_message=excluded.result_message,
      termination_reason=excluded.termination_reason, context_json=excluded.context_json
  `).run({
    id: ctx.runId,
    tenant_id: tenantId,
    goal: ctx.goal,
    status: deriveStatus(ctx),
    planner_used: ctx.plannerUsed ?? null,
    replan_count: ctx.replanCount,
    started_at: ctx.startedAt,
    ended_at: ctx.endedAt ?? null,
    result_success: ctx.result ? (ctx.result.success ? 1 : 0) : null,
    result_message: ctx.result?.message ?? null,
    termination_reason: ctx.terminationReason ?? null,
    context_json: JSON.stringify(ctx)
  });
}

export function getRun(id: string, tenantId?: string): RunContext | null {
  const db = getDb();
  const query = tenantId
    ? "SELECT context_json FROM runs WHERE id = ? AND tenant_id = ?"
    : "SELECT context_json FROM runs WHERE id = ?";
  const args = tenantId ? [id, tenantId] : [id];
  const row = db.prepare(query).get(...args) as RunRow | undefined;
  if (!row) return null;
  return JSON.parse(row.context_json) as RunContext;
}

export function listRuns(limit = 20, offset = 0, tenantId?: string): RunContext[] {
  const db = getDb();
  const query = tenantId
    ? "SELECT context_json FROM runs WHERE tenant_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?"
    : "SELECT context_json FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?";
  const args = tenantId ? [tenantId, limit, offset] : [limit, offset];
  const rows = db.prepare(query).all(...args) as RunRow[];
  return rows.map(r => JSON.parse(r.context_json) as RunContext);
}

export function findFailurePatterns(): Array<{ taskType: AgentTask["type"]; count: number; latestMessages: string[] }> {
  const runs = listRuns(100);
  const failures = new Map<string, { taskType: AgentTask["type"]; count: number; latestMessages: string[] }>();

  for (const run of runs) {
    for (const task of run.tasks) {
      if (task.status !== "failed") continue;
      const cur = failures.get(task.type) ?? { taskType: task.type, count: 0, latestMessages: [] };
      cur.count += 1;
      if (task.error) {
        cur.latestMessages.push(task.error);
        cur.latestMessages = cur.latestMessages.slice(-3);
      }
      failures.set(task.type, cur);
    }
  }
  return [...failures.values()].sort((a, b) => b.count - a.count);
}

function deriveStatus(ctx: RunContext): string {
  if (!ctx.endedAt) return "running";
  return ctx.result?.success ? "success" : "failed";
}
