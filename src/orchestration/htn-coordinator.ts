/**
 * HTN Coordinator — combines HTN-style decomposition with parallel
 * multi-agent execution using the existing coordinator primitives.
 *
 * Flow:
 *  1. Decompose goal into sub-goals via planCoordination()
 *  2. Identify independent sub-goals (no dependencies) for parallel execution
 *  3. Execute ready workers concurrently (bounded by maxParallel)
 *  4. On worker failure, mark dependent workers as failed (HTN backtracking)
 *  5. Generate final report
 */

import {
  planCoordination,
  getReadyWorkers,
  completeWorker,
  isCoordinationComplete,
  generateReport,
} from "./coordinator";
import type { CoordinationPlan, WorkerResult } from "./coordinator";

export interface HTNCoordinationResult {
  plan: CoordinationPlan;
  report: ReturnType<typeof generateReport>;
  parallelBatches: number;
  totalWorkersExecuted: number;
}

/**
 * Enhanced coordinator that:
 * 1. Decomposes goal into sub-goals via planCoordination()
 * 2. Maps independent sub-goals to parallel workers
 * 3. Maps dependent sub-goals to sequential workers
 * 4. Executes ready workers concurrently
 * 5. Handles worker failure by propagating to dependents
 */
export async function coordinateHTN(
  goal: string,
  executeWorker: (subGoal: string) => Promise<WorkerResult>,
  options?: { maxParallel?: number; maxDepth?: number }
): Promise<HTNCoordinationResult> {
  const maxParallel = options?.maxParallel ?? 3;
  const plan = planCoordination(goal);

  let parallelBatches = 0;
  let totalWorkersExecuted = 0;

  // Execute in waves until all workers are done
  while (!isCoordinationComplete(plan)) {
    const ready = getReadyWorkers(plan);
    if (ready.length === 0) {
      // No workers are ready but coordination isn't complete — mark remaining
      // pending workers as failed (their dependencies must have failed).
      failBlockedWorkers(plan);
      break;
    }

    parallelBatches++;

    // Limit concurrency per wave
    const batch = ready.slice(0, maxParallel);

    // Mark batch as running
    for (const worker of batch) {
      worker.status = "running";
      worker.assignedAt = new Date().toISOString();
    }

    // Execute all workers in the batch concurrently
    const results = await Promise.allSettled(
      batch.map((worker) => executeWorker(worker.goal))
    );

    // Process results
    for (let i = 0; i < batch.length; i++) {
      const worker = batch[i];
      const settled = results[i];
      totalWorkersExecuted++;

      if (settled.status === "fulfilled") {
        completeWorker(plan, worker.id, settled.value);
      } else {
        // Worker threw — treat as failure
        completeWorker(plan, worker.id, {
          success: false,
          summary: `Worker failed: ${settled.reason}`,
          artifacts: [],
          durationMs: 0,
        });
      }
    }
  }

  const report = generateReport(plan);
  return { plan, report, parallelBatches, totalWorkersExecuted };
}

/**
 * Mark all pending workers whose dependencies have failed as failed too.
 * This implements HTN-style backtracking: if a prerequisite sub-goal
 * cannot be achieved, dependent sub-goals are abandoned.
 */
function failBlockedWorkers(plan: CoordinationPlan): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const worker of plan.workers) {
      if (worker.status !== "pending") continue;
      const deps = plan.dependencies.get(worker.id) ?? [];
      const hasFailedDep = deps.some((depId) => {
        const dep = plan.workers.find((w) => w.id === depId);
        return dep?.status === "failed";
      });
      if (hasFailedDep) {
        worker.status = "failed";
        worker.result = {
          success: false,
          summary: "Skipped: dependency failed (HTN backtrack)",
          artifacts: [],
          durationMs: 0,
        };
        worker.completedAt = new Date().toISOString();
        changed = true;
      }
    }
  }
}
