import test from "node:test";
import assert from "node:assert/strict";
import { diffObservations, diffScenes } from "./visual-diff";
import { analyzeSceneFromText } from "./scene-analyzer";
import type { AgentObservation } from "../cognition/types";
import type { SceneDescription } from "./scene-analyzer";

function makeObs(overrides: Partial<AgentObservation> = {}): AgentObservation {
  return {
    id: "obs-1", runId: "run-1", timestamp: new Date().toISOString(),
    source: "task_observe", anomalies: [], confidence: 0.8,
    ...overrides
  };
}

// --- diffObservations tests ---

test("diffObservations: identical observations show no change", () => {
  const obs = makeObs({ visibleText: ["Hello", "World"], pageUrl: "http://localhost" });
  const diff = diffObservations(obs, obs);
  assert.equal(diff.changed, false);
  assert.equal(diff.textChanges.length, 0);
  assert.equal(diff.changeScore, 0);
});

test("diffObservations: URL change detected", () => {
  const before = makeObs({ pageUrl: "http://localhost/login" });
  const after = makeObs({ pageUrl: "http://localhost/dashboard" });
  const diff = diffObservations(before, after);
  assert.equal(diff.urlChanged, true);
  assert.equal(diff.changed, true);
  assert.ok(diff.summary.includes("URL changed"));
});

test("diffObservations: text additions and removals", () => {
  const before = makeObs({ visibleText: ["Login", "Password"] });
  const after = makeObs({ visibleText: ["Dashboard", "Welcome"] });
  const diff = diffObservations(before, after);
  assert.equal(diff.changed, true);
  assert.ok(diff.textChanges.some(c => c.type === "added" && c.text === "Dashboard"));
  assert.ok(diff.textChanges.some(c => c.type === "removed" && c.text === "Login"));
});

test("diffObservations: appState change recorded", () => {
  const before = makeObs({ appStateGuess: "ready" });
  const after = makeObs({ appStateGuess: "authenticated" });
  const diff = diffObservations(before, after);
  assert.ok(diff.stateChanges.some(s => s.includes("ready") && s.includes("authenticated")));
});

test("diffObservations: changeScore proportional to changes", () => {
  const before = makeObs({ visibleText: ["A", "B", "C", "D"] });
  const after = makeObs({ visibleText: ["A", "B", "X", "Y"] });
  const diff = diffObservations(before, after);
  assert.ok(diff.changeScore > 0);
  assert.ok(diff.changeScore <= 1);
});

// --- diffScenes tests ---

test("diffScenes: page type change detected", () => {
  const before: SceneDescription = {
    pageType: "login", layout: "", keyElements: [],
    stateIndicators: [], confidence: 0.8
  };
  const after: SceneDescription = {
    pageType: "dashboard", layout: "", keyElements: [],
    stateIndicators: [], confidence: 0.8
  };
  const diff = diffScenes(before, after);
  assert.equal(diff.changed, true);
  assert.ok(diff.stateChanges.some(s => s.includes("login") && s.includes("dashboard")));
  assert.ok(diff.changeScore >= 0.5);
});

test("diffScenes: new state indicator detected", () => {
  const before: SceneDescription = {
    pageType: "form", layout: "", keyElements: [],
    stateIndicators: [], confidence: 0.8
  };
  const after: SceneDescription = {
    pageType: "form", layout: "", keyElements: [],
    stateIndicators: ["loading spinner visible"], confidence: 0.8
  };
  const diff = diffScenes(before, after);
  assert.equal(diff.changed, true);
  assert.ok(diff.textChanges.some(c => c.type === "added" && c.text.includes("loading")));
});

test("diffScenes: identical scenes show no change", () => {
  const scene: SceneDescription = {
    pageType: "dashboard", layout: "centered", keyElements: [{ type: "button", label: "Logout" }],
    stateIndicators: ["user logged in"], confidence: 0.9
  };
  const diff = diffScenes(scene, scene);
  assert.equal(diff.changed, false);
  assert.equal(diff.changeScore, 0);
});

// --- analyzeSceneFromText tests ---

test("analyzeSceneFromText: detects login page", () => {
  const scene = analyzeSceneFromText(["Please sign in", "Email", "Password", "Login"]);
  assert.equal(scene.pageType, "login");
});

test("analyzeSceneFromText: detects dashboard", () => {
  const scene = analyzeSceneFromText(["Dashboard", "Welcome back", "Settings"]);
  assert.equal(scene.pageType, "dashboard");
});

test("analyzeSceneFromText: detects error page", () => {
  const scene = analyzeSceneFromText(["Error 500", "An error occurred", "Try again"]);
  assert.equal(scene.pageType, "error");
  assert.ok(scene.stateIndicators.some(s => s.includes("error")));
});

test("analyzeSceneFromText: detects loading state", () => {
  const scene = analyzeSceneFromText(["Loading...", "Please wait"]);
  assert.equal(scene.pageType, "loading");
  assert.ok(scene.stateIndicators.some(s => s.includes("loading")));
});

test("analyzeSceneFromText: unknown page type for generic text", () => {
  const scene = analyzeSceneFromText(["Some random content", "Nothing special"]);
  assert.equal(scene.pageType, "unknown");
});

test("analyzeSceneFromText: has low confidence", () => {
  const scene = analyzeSceneFromText(["test"]);
  assert.ok(scene.confidence <= 0.5);
});
