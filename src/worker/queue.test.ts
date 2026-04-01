import { test } from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "./queue";

test("JobQueue: processes jobs up to concurrency limit", async () => {
  const queue = new JobQueue(2);
  const order: number[] = [];
  const delays = [50, 10, 10];

  queue.setHandler(async (job) => {
    await new Promise(r => setTimeout(r, delays[Number(job.runId)]));
    order.push(Number(job.runId));
  });

  for (let i = 0; i < 3; i++) {
    queue.enqueue({ runId: String(i), goal: "test", options: {}, tenantId: "default", submittedAt: new Date().toISOString() });
  }

  // Wait for all jobs to complete
  await new Promise(r => setTimeout(r, 150));
  assert.equal(order.length, 3);
});

test("JobQueue: stats reflect pending and running counts", () => {
  const queue = new JobQueue(1);
  let resolve: () => void;
  queue.setHandler(() => new Promise(r => { resolve = r; }));

  queue.enqueue({ runId: "a", goal: "g", options: {}, tenantId: "default", submittedAt: "" });
  queue.enqueue({ runId: "b", goal: "g", options: {}, tenantId: "default", submittedAt: "" });

  const { pending, running } = queue.stats;
  assert.equal(running, 1);
  assert.equal(pending, 1);
  resolve!();
});

test("JobQueue: concurrency=1 processes jobs one at a time", async () => {
  const queue = new JobQueue(1);
  const inFlight: number[] = [];
  let maxConcurrent = 0;

  queue.setHandler(async () => {
    inFlight.push(1);
    maxConcurrent = Math.max(maxConcurrent, inFlight.length);
    await new Promise(r => setTimeout(r, 20));
    inFlight.pop();
  });

  for (let i = 0; i < 4; i++) {
    queue.enqueue({ runId: String(i), goal: "g", options: {}, tenantId: "default", submittedAt: "" });
  }

  await new Promise(r => setTimeout(r, 200));
  assert.equal(maxConcurrent, 1);
});
