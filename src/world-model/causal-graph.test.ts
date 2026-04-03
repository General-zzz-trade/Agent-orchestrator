import test from "node:test";
import assert from "node:assert/strict";
import {
  createCausalGraph,
  addStateNode,
  addCausalEdge,
  findPath,
  findPreconditions,
  serializeGraph,
  deserializeGraph
} from "./causal-graph";
import { extractCausalTransitions } from "./extractor";
import type { RunContext } from "../types";

test("addStateNode creates and increments occurrences", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "page:/login", "example.com");
  addStateNode(graph, "page:/login", "example.com");
  assert.equal(graph.nodes.get("page:/login")!.occurrences, 2);
});

test("addCausalEdge creates edge with confidence", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "page:/login", "example.com");
  addStateNode(graph, "page:/dashboard", "example.com");
  addCausalEdge(graph, "page:/login", "page:/dashboard", "click", "#login-btn", "example.com", true);

  assert.equal(graph.edges.size, 1);
  const edge = Array.from(graph.edges.values())[0];
  assert.equal(edge.confidence, 1.0);
  assert.equal(edge.successCount, 1);
});

test("addCausalEdge updates confidence on repeated observations", () => {
  const graph = createCausalGraph();
  addCausalEdge(graph, "A", "B", "click", "#btn", "d", true);
  addCausalEdge(graph, "A", "B", "click", "#btn", "d", true);
  addCausalEdge(graph, "A", "B", "click", "#btn", "d", false);

  const edge = Array.from(graph.edges.values())[0];
  assert.equal(edge.successCount, 2);
  assert.equal(edge.failureCount, 1);
  assert.ok(Math.abs(edge.confidence - 2/3) < 0.01);
});

test("findPath: direct transition", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "login", "d");
  addStateNode(graph, "dashboard", "d");
  addCausalEdge(graph, "login", "dashboard", "click", "#login", "d", true);

  const path = findPath(graph, "login", "dashboard");
  assert.equal(path.length, 1);
  assert.equal(path[0].action, "click");
});

test("findPath: multi-step transition", () => {
  const graph = createCausalGraph();
  addCausalEdge(graph, "landing", "login", "open_page", "/login", "d", true);
  addCausalEdge(graph, "login", "form_filled", "type", "#password", "d", true);
  addCausalEdge(graph, "form_filled", "dashboard", "click", "#submit", "d", true);

  const path = findPath(graph, "landing", "dashboard");
  assert.equal(path.length, 3);
  assert.equal(path[0].toState, "login");
  assert.equal(path[2].toState, "dashboard");
});

test("findPath: returns empty for unreachable goal", () => {
  const graph = createCausalGraph();
  addCausalEdge(graph, "A", "B", "click", "#x", "d", true);

  const path = findPath(graph, "A", "Z");
  assert.equal(path.length, 0);
});

test("findPath: skips low-confidence edges", () => {
  const graph = createCausalGraph();
  // Add a low-confidence path A→B→C
  addCausalEdge(graph, "A", "B", "click", "#x", "d", false); // 0% confidence
  addCausalEdge(graph, "B", "C", "click", "#y", "d", true);
  // Add a high-confidence direct path A→C
  addCausalEdge(graph, "A", "C", "click", "#z", "d", true);

  const path = findPath(graph, "A", "C");
  assert.equal(path.length, 1); // direct path, not through B
  assert.equal(path[0].actionDetail, "#z");
});

test("findPreconditions: returns edges leading to goal", () => {
  const graph = createCausalGraph();
  addCausalEdge(graph, "login", "dashboard", "click", "#login", "d", true);
  addCausalEdge(graph, "register", "dashboard", "click", "#register", "d", true);

  const preconds = findPreconditions(graph, "dashboard");
  assert.equal(preconds.length, 2);
});

test("serialize and deserialize round-trip", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "A", "d");
  addStateNode(graph, "B", "d");
  addCausalEdge(graph, "A", "B", "click", "#x", "d", true);

  const json = serializeGraph(graph);
  const restored = deserializeGraph(json);

  assert.equal(restored.nodes.size, 2);
  assert.equal(restored.edges.size, 1);
  assert.equal(findPath(restored, "A", "B").length, 1);
});

test("extractCausalTransitions from successful run", () => {
  const graph = createCausalGraph();
  const context: RunContext = {
    runId: "run-causal", goal: "test", tasks: [
      { id: "t1", type: "open_page", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: { url: "http://localhost:3000/login" } },
      { id: "t2", type: "click", status: "done", retries: 0, attempts: 1, replanDepth: 0, payload: { selector: "#login-btn" } }
    ],
    artifacts: [], replanCount: 0, nextTaskSequence: 2, insertedTaskCount: 0,
    llmReplannerInvocations: 0, llmReplannerTimeoutCount: 0, llmReplannerFallbackCount: 0,
    escalationDecisions: [], limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString(),
    observations: [
      { id: "o1", runId: "run-causal", taskId: "t1", timestamp: new Date().toISOString(), source: "task_observe", pageUrl: "about:blank", visibleText: [], anomalies: [], confidence: 0.8 },
      { id: "o2", runId: "run-causal", taskId: "t1", timestamp: new Date().toISOString(), source: "task_observe", pageUrl: "http://localhost:3000/login", visibleText: ["Login", "Sign in"], anomalies: [], confidence: 0.8, appStateGuess: "ready" },
      { id: "o3", runId: "run-causal", taskId: "t2", timestamp: new Date().toISOString(), source: "task_observe", pageUrl: "http://localhost:3000/login", visibleText: ["Login"], anomalies: [], confidence: 0.8, appStateGuess: "ready" },
      { id: "o4", runId: "run-causal", taskId: "t2", timestamp: new Date().toISOString(), source: "task_observe", pageUrl: "http://localhost:3000/dashboard", visibleText: ["Dashboard"], anomalies: [], confidence: 0.8, appStateGuess: "authenticated" }
    ]
  };

  const count = extractCausalTransitions(context, graph);
  assert.ok(count >= 1, `Expected at least 1 transition, got ${count}`);
  assert.ok(graph.nodes.size >= 2);
  assert.ok(graph.edges.size >= 1);
});
