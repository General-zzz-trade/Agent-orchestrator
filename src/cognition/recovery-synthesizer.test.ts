import test from "node:test";
import assert from "node:assert/strict";

import {
  synthesizeRecovery,
  recordRecoveryOutcome,
  programToTasks,
  getSkillLibrary,
  resetSkillLibrary
} from "./recovery-synthesizer";
import type { RecoveryProgram } from "./types";
import type { AgentTask, RunContext } from "../types";

function makeProgram(overrides: Partial<RecoveryProgram> = {}): RecoveryProgram {
  return {
    id: `rp-test-${Math.random().toString(36).slice(2, 6)}`,
    triggerPattern: "element not found",
    steps: [
      { type: "wait", payload: { ms: 1000 } },
      { type: "click", payload: { selector: "#retry" } }
    ],
    successCount: 0,
    failureCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function makeMinimalContext(): RunContext {
  return {
    runId: "test-run",
    goal: "test goal",
    tasks: [],
    artifacts: [],
    replanCount: 0,
    nextTaskSequence: 0,
    insertedTaskCount: 0,
    llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0,
    llmReplannerFallbackCount: 0,
    limits: { maxReplansPerRun: 3, maxReplansPerTask: 2 },
    startedAt: new Date().toISOString(),
    escalationDecisions: []
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    type: "click",
    status: "failed",
    retries: 0,
    attempts: 1,
    replanDepth: 0,
    payload: { selector: "#btn" },
    ...overrides
  };
}

test("programToTasks converts program steps to AgentTask array", () => {
  const program = makeProgram();
  const tasks = programToTasks(program, "base-task");

  assert.equal(tasks.length, 2);

  assert.equal(tasks[0].id, "base-task-recovery-0");
  assert.equal(tasks[0].type, "wait");
  assert.equal(tasks[0].status, "pending");
  assert.equal(tasks[0].retries, 0);
  assert.equal(tasks[0].attempts, 0);
  assert.equal(tasks[0].replanDepth, 0);
  assert.deepEqual(tasks[0].payload, { ms: 1000 });

  assert.equal(tasks[1].id, "base-task-recovery-1");
  assert.equal(tasks[1].type, "click");
  assert.deepEqual(tasks[1].payload, { selector: "#retry" });
});

test("programToTasks handles empty steps", () => {
  const program = makeProgram({ steps: [] });
  const tasks = programToTasks(program, "base");
  assert.equal(tasks.length, 0);
});

test("recordRecoveryOutcome adds successful program to library", () => {
  resetSkillLibrary();

  const program = makeProgram();
  recordRecoveryOutcome(program, true);

  const library = getSkillLibrary();
  assert.equal(library.length, 1);
  assert.equal(library[0].id, program.id);
  assert.equal(library[0].successCount, 1);
  assert.equal(library[0].failureCount, 0);
});

test("recordRecoveryOutcome does not duplicate program on multiple successes", () => {
  resetSkillLibrary();

  const program = makeProgram();
  recordRecoveryOutcome(program, true);
  recordRecoveryOutcome(program, true);

  const library = getSkillLibrary();
  assert.equal(library.length, 1);
  assert.equal(program.successCount, 2);
});

test("recordRecoveryOutcome increments failure count", () => {
  resetSkillLibrary();

  const program = makeProgram();
  recordRecoveryOutcome(program, false);

  assert.equal(program.failureCount, 1);
  // Failed programs are not added to library
  const library = getSkillLibrary();
  assert.equal(library.length, 0);
});

test("findMatchingProgram returns matching program via synthesizeRecovery", async () => {
  resetSkillLibrary();

  // First, add a successful program to the library
  const program = makeProgram({ triggerPattern: "element not found" });
  recordRecoveryOutcome(program, true);
  recordRecoveryOutcome(program, true); // ensure successCount > failureCount

  // Now synthesizeRecovery should find it from the library
  const result = await synthesizeRecovery({
    context: makeMinimalContext(),
    task: makeTask(),
    error: "element not found: #missing-btn",
    previousAttempts: []
  });

  assert.ok(result);
  assert.equal(result.id, program.id);
});

test("findMatchingProgram skips unreliable programs", async () => {
  resetSkillLibrary();

  // Add a program with more failures than successes
  const program = makeProgram({ triggerPattern: "timeout" });
  recordRecoveryOutcome(program, true); // in library now
  recordRecoveryOutcome(program, false);
  recordRecoveryOutcome(program, false);
  // successCount=1, failureCount=2 -> unreliable (success <= failure)

  // No LLM configured, so if library doesn't match, returns null
  const result = await synthesizeRecovery({
    context: makeMinimalContext(),
    task: makeTask(),
    error: "timeout occurred",
    previousAttempts: []
  });

  assert.equal(result, null);
});

test("pruneSkillLibrary removes programs with poor success rate", () => {
  resetSkillLibrary();

  const program = makeProgram();
  // Add to library via success
  recordRecoveryOutcome(program, true);
  assert.equal(getSkillLibrary().length, 1);

  // Now fail it enough to trigger pruning (need total >= 4, success rate < 30%)
  recordRecoveryOutcome(program, false);
  recordRecoveryOutcome(program, false);
  recordRecoveryOutcome(program, false);
  // total=4, success=1, rate=25% < 30% -> pruned

  assert.equal(getSkillLibrary().length, 0);
});

test("synthesizeRecovery returns null when no LLM configured", async () => {
  resetSkillLibrary();

  // Ensure no LLM_RECOVERY env vars are set
  const savedProvider = process.env.LLM_RECOVERY_PROVIDER;
  const savedKey = process.env.LLM_RECOVERY_API_KEY;
  delete process.env.LLM_RECOVERY_PROVIDER;
  delete process.env.LLM_RECOVERY_API_KEY;

  try {
    const result = await synthesizeRecovery({
      context: makeMinimalContext(),
      task: makeTask(),
      error: "some error",
      previousAttempts: ["attempt 1"]
    });

    assert.equal(result, null);
  } finally {
    // Restore env
    if (savedProvider !== undefined) process.env.LLM_RECOVERY_PROVIDER = savedProvider;
    if (savedKey !== undefined) process.env.LLM_RECOVERY_API_KEY = savedKey;
  }
});

test("resetSkillLibrary clears all programs", () => {
  resetSkillLibrary();
  const program = makeProgram();
  recordRecoveryOutcome(program, true);
  assert.equal(getSkillLibrary().length, 1);

  resetSkillLibrary();
  assert.equal(getSkillLibrary().length, 0);
});
