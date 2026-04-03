import { getDb } from "./client";
import { RunContext, AgentTask } from "../types";
import { AgentObservation, EpisodeEvent, VerificationResult, WorldStateSnapshot } from "../cognition/types";

interface RunRow {
  context_json: string;
}

interface JsonRow {
  payload_json: string;
}

export interface RunCognitionRecord {
  worldState?: WorldStateSnapshot;
  worldStateHistory: NonNullable<RunContext["worldStateHistory"]>;
  latestObservation?: AgentObservation;
  observations: AgentObservation[];
  hypotheses: NonNullable<RunContext["hypotheses"]>;
  experimentResults: NonNullable<RunContext["experimentResults"]>;
  beliefUpdates: NonNullable<RunContext["beliefUpdates"]>;
  verificationResults: VerificationResult[];
  cognitiveDecisions: NonNullable<RunContext["cognitiveDecisions"]>;
  episodeEvents: EpisodeEvent[];
}

export function upsertRun(ctx: RunContext, tenantId = "default"): void {
  const db = getDb();
  const transaction = db.transaction(() => {
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

    persistCognition(db, ctx, tenantId);
  });

  transaction();
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

export function getRunCognition(id: string, tenantId?: string): RunCognitionRecord | null {
  const run = getRun(id, tenantId);
  if (!run) {
    return null;
  }

  const db = getDb();
  const observations = loadJsonRows<AgentObservation>(
    db,
    tenantId
      ? "SELECT payload_json FROM observations WHERE run_id = ? AND tenant_id = ? ORDER BY timestamp ASC"
      : "SELECT payload_json FROM observations WHERE run_id = ? ORDER BY timestamp ASC",
    tenantId ? [id, tenantId] : [id]
  );
  const verificationResults = loadJsonRows<VerificationResult>(
    db,
    tenantId
      ? "SELECT payload_json FROM verification_results WHERE run_id = ? AND tenant_id = ? ORDER BY created_at ASC, id ASC"
      : "SELECT payload_json FROM verification_results WHERE run_id = ? ORDER BY created_at ASC, id ASC",
    tenantId ? [id, tenantId] : [id]
  );
  const episodeEvents = loadJsonRows<EpisodeEvent>(
    db,
    tenantId
      ? "SELECT payload_json FROM episode_events WHERE run_id = ? AND tenant_id = ? ORDER BY timestamp ASC"
      : "SELECT payload_json FROM episode_events WHERE run_id = ? ORDER BY timestamp ASC",
    tenantId ? [id, tenantId] : [id]
  );

  return {
    worldState: run.worldState,
    worldStateHistory: run.worldStateHistory ?? (run.worldState ? [run.worldState] : []),
    latestObservation: run.latestObservation,
    observations,
    hypotheses: run.hypotheses ?? [],
    experimentResults: run.experimentResults ?? [],
    beliefUpdates: run.beliefUpdates ?? [],
    verificationResults,
    cognitiveDecisions: run.cognitiveDecisions ?? [],
    episodeEvents
  };
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

function persistCognition(
  db: ReturnType<typeof getDb>,
  ctx: RunContext,
  tenantId: string
): void {
  db.prepare("DELETE FROM observations WHERE run_id = ?").run(ctx.runId);
  db.prepare("DELETE FROM verification_results WHERE run_id = ?").run(ctx.runId);
  db.prepare("DELETE FROM episode_events WHERE run_id = ?").run(ctx.runId);

  const insertObservation = db.prepare(`
    INSERT INTO observations (id, run_id, tenant_id, task_id, timestamp, payload_json)
    VALUES (@id, @run_id, @tenant_id, @task_id, @timestamp, @payload_json)
  `);
  for (const observation of collectObservations(ctx)) {
    insertObservation.run({
      id: observation.id,
      run_id: ctx.runId,
      tenant_id: tenantId,
      task_id: observation.taskId ?? null,
      timestamp: observation.timestamp,
      payload_json: JSON.stringify(observation)
    });
  }

  const insertVerification = db.prepare(`
    INSERT INTO verification_results (
      run_id, tenant_id, task_id, verifier, passed, confidence, rationale, payload_json, created_at
    ) VALUES (
      @run_id, @tenant_id, @task_id, @verifier, @passed, @confidence, @rationale, @payload_json, @created_at
    )
  `);
  for (const verification of ctx.verificationResults ?? []) {
    insertVerification.run({
      run_id: ctx.runId,
      tenant_id: tenantId,
      task_id: verification.taskId ?? null,
      verifier: verification.verifier,
      passed: verification.passed ? 1 : 0,
      confidence: verification.confidence,
      rationale: verification.rationale,
      payload_json: JSON.stringify(verification),
      created_at: new Date().toISOString()
    });
  }

  const insertEpisode = db.prepare(`
    INSERT INTO episode_events (id, run_id, tenant_id, task_id, kind, timestamp, summary, payload_json)
    VALUES (@id, @run_id, @tenant_id, @task_id, @kind, @timestamp, @summary, @payload_json)
  `);
  for (const event of ctx.episodeEvents ?? []) {
    insertEpisode.run({
      id: event.id,
      run_id: ctx.runId,
      tenant_id: tenantId,
      task_id: event.taskId ?? null,
      kind: event.kind,
      timestamp: event.timestamp,
      summary: event.summary,
      payload_json: JSON.stringify(event)
    });
  }
}

function collectObservations(ctx: RunContext): AgentObservation[] {
  const observations = new Map<string, AgentObservation>();

  for (const observation of ctx.observations ?? []) {
    observations.set(observation.id, observation);
  }

  if (ctx.latestObservation) {
    observations.set(ctx.latestObservation.id, ctx.latestObservation);
  }

  return Array.from(observations.values()).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function loadJsonRows<T>(
  db: ReturnType<typeof getDb>,
  query: string,
  args: unknown[]
): T[] {
  const rows = db.prepare(query).all(...args) as JsonRow[];
  return rows.map((row) => JSON.parse(row.payload_json) as T);
}
