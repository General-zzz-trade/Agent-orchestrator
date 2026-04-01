import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCounter, registerGauge, incCounter, setGauge, renderPrometheus, getSnapshot } from "./metrics-store";

test("incCounter: accumulates value", () => {
  registerCounter("test_counter_a", "test help");
  incCounter("test_counter_a");
  incCounter("test_counter_a", 3);
  const snap = getSnapshot();
  assert.equal(snap["test_counter_a"], 4);
});

test("setGauge: updates value", () => {
  registerGauge("test_gauge_a", "test help");
  setGauge("test_gauge_a", 42);
  const snap = getSnapshot();
  assert.equal(snap["test_gauge_a"], 42);
  setGauge("test_gauge_a", 10);
  assert.equal(getSnapshot()["test_gauge_a"], 10);
});

test("renderPrometheus: includes registered metrics in text format", () => {
  registerCounter("test_render_counter", "a counter");
  registerGauge("test_render_gauge", "a gauge");
  incCounter("test_render_counter", 5);
  setGauge("test_render_gauge", 7);
  const output = renderPrometheus();
  assert.ok(output.includes("# TYPE test_render_counter counter"), "should have counter TYPE");
  assert.ok(output.includes("test_render_counter 5"), "should have counter value");
  assert.ok(output.includes("# TYPE test_render_gauge gauge"), "should have gauge TYPE");
  assert.ok(output.includes("test_render_gauge 7"), "should have gauge value");
});

test("standard metrics are pre-registered", () => {
  const snap = getSnapshot();
  assert.ok("agent_runs_total" in snap);
  assert.ok("agent_queue_pending" in snap);
});
