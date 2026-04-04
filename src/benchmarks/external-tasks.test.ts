import test from "node:test";
import assert from "node:assert/strict";
import { getExternalBenchmarkTasks } from "./external-tasks";

test("getExternalBenchmarkTasks returns 8 tasks", () => {
  const tasks = getExternalBenchmarkTasks();
  assert.equal(tasks.length, 8);
});

test("all tasks have required fields", () => {
  const tasks = getExternalBenchmarkTasks();
  for (const task of tasks) {
    assert.ok(task.id, `task missing id`);
    assert.ok(task.name, `task ${task.id} missing name`);
    assert.ok(task.goal, `task ${task.id} missing goal`);
    assert.equal(typeof task.verify, "function", `task ${task.id} missing verify function`);
    assert.ok(task.difficulty, `task ${task.id} missing difficulty`);
    assert.ok(task.category, `task ${task.id} missing category`);
    assert.ok(task.description, `task ${task.id} missing description`);
  }
});

test("no task uses start_app or stop_app", () => {
  const tasks = getExternalBenchmarkTasks();
  for (const task of tasks) {
    assert.ok(
      !task.goal.includes("start_app") && !task.goal.includes("start app"),
      `task ${task.id} should not use start_app`
    );
    assert.ok(
      !task.goal.includes("stop_app") && !task.goal.includes("stop app"),
      `task ${task.id} should not use stop_app`
    );
  }
});

test("all task ids start with EXT", () => {
  const tasks = getExternalBenchmarkTasks();
  for (const task of tasks) {
    assert.ok(task.id.startsWith("EXT"), `task ${task.id} should have EXT prefix`);
  }
});

test("all tasks target external URLs", () => {
  const tasks = getExternalBenchmarkTasks();
  for (const task of tasks) {
    assert.ok(
      task.goal.includes("https://") || task.goal.includes("http://"),
      `task ${task.id} should target an external URL`
    );
  }
});
