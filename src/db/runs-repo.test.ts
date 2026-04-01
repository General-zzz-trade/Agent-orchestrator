import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertRun, getRun, listRuns } from "./runs-repo";
import { closeDb } from "./client";
import type { RunContext } from "../types";

function makeRun(id: string): RunContext {
  return {
    runId: id, goal: "test goal", tasks: [], artifacts: [], replanCount: 0,
    nextTaskSequence: 0, insertedTaskCount: 0, llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0, llmReplannerFallbackCount: 0,
    escalationDecisions: [], limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString()
  } as unknown as RunContext;
}

test("upsertRun + getRun roundtrip", () => {
  const run = makeRun("repo-test-001");
  upsertRun(run);
  const loaded = getRun("repo-test-001");
  assert.equal(loaded?.runId, "repo-test-001");
  assert.equal(loaded?.goal, "test goal");
});

test("upsertRun update: result stored on second write", () => {
  const run = makeRun("repo-test-002");
  upsertRun(run);
  run.endedAt = new Date().toISOString();
  run.result = { success: true, message: "done" };
  upsertRun(run);
  const loaded = getRun("repo-test-002");
  assert.equal(loaded?.result?.success, true);
});

test("listRuns returns most recent first", () => {
  const r1 = makeRun("repo-test-003");
  r1.startedAt = "2024-01-01T00:00:00.000Z";
  const r2 = makeRun("repo-test-004");
  r2.startedAt = "2024-06-01T00:00:00.000Z";
  upsertRun(r1); upsertRun(r2);
  // Use large limit to ensure both records appear even if DB has prior records
  const list = listRuns(500);
  const ids = list.map(r => r.runId);
  assert.ok(ids.includes("repo-test-003"), "should include repo-test-003");
  assert.ok(ids.includes("repo-test-004"), "should include repo-test-004");
  assert.ok(ids.indexOf("repo-test-004") < ids.indexOf("repo-test-003"), "004 (newer) should come before 003 (older)");
  closeDb();
});
