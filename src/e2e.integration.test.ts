import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { runGoal } from "./core/runtime";

test("runtime executes sample app end-to-end", { timeout: 30000 }, async () => {
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const goal =
    `start app "tsx src/sample-app/server.ts ${port}" and wait for server "${url}" and open page "${url}" and click "#login-button" and assert text "Dashboard" and screenshot to artifacts/e2e-sample.png and stop app`;

  const run = await runGoal(goal);

  assert.equal(run.result?.success, true);
  assert.ok(run.tasks.some((task) => task.type === "click" && task.status === "done"));
  assert.ok(run.tasks.some((task) => task.type === "assert_text" && task.status === "done"));
  assert.ok(run.artifacts.some((artifact) => artifact.type === "screenshot"));
  await access("artifacts/e2e-sample.png");
  assert.equal(run.metrics?.failedTasks, 0);
  assert.equal(run.metrics?.totalReplans, 0);
});

test("runtime handles delayed login dynamic scenario", { timeout: 30000 }, async () => {
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const goal =
    `start app "tsx src/sample-app/server.ts ${port}" and wait for server "${url}" and open page "${url}" and click "#delayed-login-button" and assert text "Dashboard" timeout 1 second and screenshot to artifacts/e2e-delayed-login.png and stop app`;

  const run = await runGoal(goal, {
    maxReplansPerRun: 2,
    maxReplansPerTask: 1,
    maxLLMReplannerCalls: 0
  });

  assert.equal(run.result?.success, true);
  assert.ok((run.metrics?.totalRetries ?? 0) >= 1);
  await access("artifacts/e2e-delayed-login.png");
});

test("runtime handles assert_text failure scenario", { timeout: 30000 }, async () => {
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const goal =
    `start app "tsx src/sample-app/server.ts ${port}" and wait for server "${url}" and open page "${url}" and click "#login-button" and assert text "Missing Dashboard" timeout 1 second and stop app`;

  const run = await runGoal(goal, {
    maxReplansPerRun: 2,
    maxReplansPerTask: 1,
    maxLLMReplannerCalls: 0
  });

  assert.equal(run.result?.success, false);
  assert.ok(run.tasks.some((task) => task.type === "assert_text" && task.status === "failed"));
  assert.ok((run.metrics?.totalReplans ?? 0) >= 1);
  assert.match(run.reflection?.diagnosis ?? "", /Most unstable task type:/);
});

test("runtime handles wait_for_server timeout scenario", { timeout: 30000 }, async () => {
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const goal = `wait for server "${url}" timeout 1 second`;

  const run = await runGoal(goal, {
    maxReplansPerRun: 0,
    maxReplansPerTask: 1
  });

  assert.equal(run.result?.success, false);
  assert.ok(run.tasks.some((task) => task.type === "wait_for_server" && task.status === "failed"));
  assert.ok((run.metrics?.failedTasks ?? 0) >= 1);
  assert.ok(run.result?.message.includes("did not become available") || run.result?.message.includes("budget exceeded"));
});

test("runtime can recover with mock llm replanner", { timeout: 30000 }, async () => {
  const previousProvider = process.env.LLM_REPLANNER_PROVIDER;
  process.env.LLM_REPLANNER_PROVIDER = "mock";

  try {
    const port = await getAvailablePort();
    const url = `http://127.0.0.1:${port}`;
    const goal =
      `start app "tsx src/sample-app/server.ts ${port}" and wait for server "${url}" and open page "${url}" and click "#login-button" and assert text "Wrong Dashboard" timeout 1 second and stop app`;

    const run = await runGoal(goal, {
      maxReplansPerRun: 2,
      maxReplansPerTask: 1,
      maxLLMPlannerCalls: 0,
      maxLLMReplannerCalls: 1,
      maxLLMReplannerTimeouts: 1
    });

    assert.equal(run.result?.success, true);
    assert.ok(run.llmReplannerInvocations >= 1);
    assert.ok(run.insertedTaskCount >= 1);
  } finally {
    if (previousProvider === undefined) {
      delete process.env.LLM_REPLANNER_PROVIDER;
    } else {
      process.env.LLM_REPLANNER_PROVIDER = previousProvider;
    }
  }
});

async function getAvailablePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate a port for the sample app.");
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  return address.port;
}
