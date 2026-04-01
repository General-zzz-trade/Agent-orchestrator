import { test } from "node:test";
import assert from "node:assert/strict";
import { handleReadFileTask, handleWriteFileTask } from "./file-handler";
import { unlinkSync, existsSync } from "node:fs";
import type { RunContext, AgentTask } from "../types";

function makeCtx(): RunContext {
  return { runId: "test", goal: "test", tasks: [], artifacts: [], replanCount: 0,
    nextTaskSequence: 0, insertedTaskCount: 0, llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0, llmReplannerFallbackCount: 0,
    escalationDecisions: [], limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString() } as unknown as RunContext;
}

function makeTask(type: string, payload: Record<string, string | number>): AgentTask {
  return { id: "t1", type, status: "pending", retries: 0, attempts: 0,
    replanDepth: 0, payload } as unknown as AgentTask;
}

const testFile = "artifacts/test-file-handler.txt";

test("write_file: creates file with content", async () => {
  const result = await handleWriteFileTask(makeCtx(), makeTask("write_file", { path: testFile, content: "hello world" }));
  assert.ok(result.summary.includes("11 chars"));
  assert.ok(existsSync(testFile));
});

test("read_file: reads existing file", async () => {
  const result = await handleReadFileTask(makeCtx(), makeTask("read_file", { path: testFile }));
  assert.ok(result.summary.includes("hello world"));
  unlinkSync(testFile);
});

test("read_file: missing path throws", async () => {
  await assert.rejects(() => handleReadFileTask(makeCtx(), makeTask("read_file", {})), /path is required/);
});

test("write_file: missing path throws", async () => {
  await assert.rejects(() => handleWriteFileTask(makeCtx(), makeTask("write_file", { content: "x" })), /path is required/);
});

test("read_file: path traversal blocked", async () => {
  await assert.rejects(
    () => handleReadFileTask(makeCtx(), makeTask("read_file", { path: "../../etc/passwd" })),
    /outside the working directory/
  );
});
