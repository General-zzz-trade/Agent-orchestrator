import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrCreateEmitter, publishEvent, closeEmitter, hasEmitter } from "./event-bus";

test("getOrCreateEmitter: creates emitter for new runId", () => {
  const emitter = getOrCreateEmitter("test-run-1");
  assert.ok(emitter);
  assert.ok(hasEmitter("test-run-1"));
  closeEmitter("test-run-1");
});

test("publishEvent: listeners receive events", (_, done) => {
  const emitter = getOrCreateEmitter("test-run-2");
  emitter.on("event", (evt) => {
    assert.equal(evt.type, "task_start");
    assert.equal(evt.runId, "test-run-2");
    closeEmitter("test-run-2");
    done();
  });
  publishEvent({ type: "task_start", runId: "test-run-2", timestamp: new Date().toISOString() });
});

test("closeEmitter: removes emitter and fires close", (_, done) => {
  const emitter = getOrCreateEmitter("test-run-3");
  emitter.once("close", () => {
    assert.ok(!hasEmitter("test-run-3"));
    done();
  });
  closeEmitter("test-run-3");
});

test("publishEvent: no-op when emitter does not exist", () => {
  // Should not throw
  assert.doesNotThrow(() => {
    publishEvent({ type: "log", runId: "nonexistent", timestamp: new Date().toISOString(), message: "hello" });
  });
});
