import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeObservation,
  cosineSimilarity,
  detectLoop,
  assignCluster,
  isNovelState,
  resetClusters
} from "./state-encoder";
import type { AgentObservation } from "../cognition/types";

function makeObs(overrides: Partial<AgentObservation> = {}): AgentObservation {
  return {
    id: "obs-1",
    runId: "run-1",
    timestamp: new Date().toISOString(),
    source: "task_observe",
    anomalies: [],
    confidence: 0.9,
    pageUrl: "https://example.com/dashboard",
    appStateGuess: "ready",
    visibleText: ["Welcome to the dashboard", "Projects list"],
    ...overrides
  };
}

test("encodeObservation produces a 128-dim vector", () => {
  const obs = makeObs();
  const vec = encodeObservation(obs);
  assert.equal(vec.length, 128);
  // Should be normalized (L2 norm ~ 1)
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  assert.ok(norm > 0.99 && norm < 1.01, `Expected norm ~1, got ${norm}`);
});

test("cosineSimilarity of identical vectors = 1", () => {
  const v = [1, 2, 3, 4, 5];
  const sim = cosineSimilarity(v, v);
  assert.ok(Math.abs(sim - 1) < 1e-10, `Expected 1, got ${sim}`);
});

test("cosineSimilarity of orthogonal vectors = 0", () => {
  const a = [1, 0, 0, 0];
  const b = [0, 1, 0, 0];
  const sim = cosineSimilarity(a, b);
  assert.ok(Math.abs(sim) < 1e-10, `Expected 0, got ${sim}`);
});

test("detectLoop detects similar states", () => {
  const obs = makeObs();
  const emb = encodeObservation(obs);
  // Identical embedding should be a loop
  const result = detectLoop(emb, [emb]);
  assert.equal(result.isLoop, true);
  assert.ok(result.similarity >= 0.95);
  assert.equal(result.matchIndex, 0);
});

test("detectLoop returns false for dissimilar states", () => {
  const obs1 = makeObs({ pageUrl: "https://example.com/login", appStateGuess: "loading", visibleText: ["Sign in to your account"] });
  const obs2 = makeObs({ pageUrl: "https://example.com/dashboard", appStateGuess: "ready", visibleText: ["Welcome admin dashboard analytics"] });
  const emb1 = encodeObservation(obs1);
  const emb2 = encodeObservation(obs2);
  const result = detectLoop(emb1, [emb2]);
  assert.equal(result.isLoop, false);
  assert.equal(result.matchIndex, -1);
});

test("assignCluster creates new cluster for novel state", () => {
  resetClusters();
  const obs = makeObs();
  const emb = encodeObservation(obs);
  const cluster = assignCluster(emb, "test-state", "example.com");
  assert.equal(cluster.id, "cluster_0");
  assert.equal(cluster.memberCount, 1);
  assert.equal(cluster.label, "test-state");
  assert.equal(cluster.domain, "example.com");
});

test("assignCluster assigns to existing cluster for similar state", () => {
  resetClusters();
  const obs = makeObs();
  const emb = encodeObservation(obs);
  const cluster1 = assignCluster(emb, "state-a", "example.com");
  assert.equal(cluster1.memberCount, 1);

  // Same observation should land in same cluster
  const cluster2 = assignCluster(emb, "state-a", "example.com");
  assert.equal(cluster2.id, cluster1.id);
  assert.equal(cluster2.memberCount, 2);
});

test("isNovelState returns true when no clusters exist", () => {
  resetClusters();
  const obs = makeObs();
  const emb = encodeObservation(obs);
  assert.equal(isNovelState(emb), true);
});
