import test from "node:test";
import assert from "node:assert/strict";
import { coordinateHTN } from "./htn-coordinator";
import type { WorkerResult } from "./coordinator";

test("coordinateHTN executes parallel sub-goals concurrently", async () => {
  const executionOrder: string[] = [];

  const result = await coordinateHTN(
    "test login, search, and logout",
    async (subGoal: string): Promise<WorkerResult> => {
      executionOrder.push(subGoal);
      return {
        success: true,
        summary: `Completed: ${subGoal}`,
        artifacts: [],
        durationMs: 10,
      };
    },
    { maxParallel: 3 }
  );

  assert.equal(result.report.succeeded, 3, "all 3 sub-goals should succeed");
  assert.equal(result.report.failed, 0, "no failures expected");
  assert.equal(result.totalWorkersExecuted, 3);
  assert.ok(result.parallelBatches >= 1, "at least one batch executed");
  assert.equal(executionOrder.length, 3, "all 3 workers executed");
});

test("coordinateHTN handles worker failure gracefully", async () => {
  let callCount = 0;

  const result = await coordinateHTN(
    "check alpha, beta, and gamma",
    async (subGoal: string): Promise<WorkerResult> => {
      callCount++;
      if (subGoal.includes("beta")) {
        return {
          success: false,
          summary: "beta check failed",
          artifacts: [],
          durationMs: 5,
        };
      }
      return {
        success: true,
        summary: `OK: ${subGoal}`,
        artifacts: [],
        durationMs: 10,
      };
    }
  );

  assert.equal(callCount, 3, "all workers should still be attempted");
  assert.equal(result.report.succeeded, 2, "two should succeed");
  assert.equal(result.report.failed, 1, "one should fail");
  assert.ok(result.report.summary.includes("2/3 succeeded"));
});
