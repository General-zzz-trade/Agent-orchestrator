import test, { describe, mock } from "node:test";
import assert from "node:assert/strict";
import { decomposeGoalSimple, decomposeGoalLLM } from "./htn-runtime";

// ── decomposeGoalSimple ─────────────────────────────────────────────────────

describe("decomposeGoalSimple", () => {
  test("splits on 'then' conjunction", () => {
    const parts = decomposeGoalSimple("Open the menu then click Settings");
    assert.equal(parts.length, 2);
    assert.equal(parts[0], "Open the menu");
    assert.equal(parts[1], "click Settings");
  });

  test("splits on 'and then' conjunction", () => {
    const parts = decomposeGoalSimple("Log in and then navigate to dashboard");
    assert.equal(parts.length, 2);
    assert.equal(parts[0], "Log in");
    assert.equal(parts[1], "navigate to dashboard");
  });

  test("splits on semicolons", () => {
    const parts = decomposeGoalSimple("Step one; step two; step three");
    assert.equal(parts.length, 3);
    assert.equal(parts[0], "Step one");
    assert.equal(parts[1], "step two");
    assert.equal(parts[2], "step three");
  });

  test("falls back to navigate+act for unsplittable goals", () => {
    const parts = decomposeGoalSimple("Buy a coffee");
    assert.equal(parts.length, 2);
    assert.ok(parts[0].includes("Navigate"));
    assert.ok(parts[1].includes("Perform the action"));
  });

  test("caps at 5 sub-goals", () => {
    const goal = "a; b; c; d; e; f; g";
    const parts = decomposeGoalSimple(goal);
    assert.ok(parts.length <= 5);
  });
});

// ── decomposeGoalLLM ────────────────────────────────────────────────────────

describe("decomposeGoalLLM", () => {
  test("falls back to simple decomposition when no LLM configured", async () => {
    // Without LLM_PLANNER_API_KEY set, it should fall back to simple splitting
    const original = process.env.LLM_PLANNER_API_KEY;
    delete process.env.LLM_PLANNER_API_KEY;

    try {
      const parts = await decomposeGoalLLM("Open settings then toggle dark mode");
      assert.ok(parts.length >= 2, `Expected >= 2 parts, got ${parts.length}`);
      // Should have used simple decomposition since no API key
      assert.ok(parts.every(p => typeof p === "string"));
    } finally {
      if (original !== undefined) {
        process.env.LLM_PLANNER_API_KEY = original;
      }
    }
  });
});

// ── HTN plan structure ──────────────────────────────────────────────────────

describe("HTN plan structure", () => {
  // We test createHTNPlan via the decomposer module, but verify our runtime
  // integrates correctly by importing the plan utilities and checking shapes.

  test("createHTNPlan produces valid root node", async () => {
    const { createHTNPlan } = await import("../decomposer/htn-planner");
    const plan = createHTNPlan("Test goal");
    const root = plan.nodes.get(plan.rootId);

    assert.ok(root, "root node exists");
    assert.equal(root.goal, "Test goal");
    assert.equal(root.depth, 0);
    assert.equal(root.status, "pending");
    assert.equal(root.children.length, 0);
  });

  test("decomposeNode adds children at correct depth", async () => {
    const { createHTNPlan, decomposeNode } = await import("../decomposer/htn-planner");
    const plan = createHTNPlan("Parent goal");
    const childIds = decomposeNode(plan, plan.rootId, ["Sub A", "Sub B"]);

    assert.equal(childIds.length, 2);

    const childA = plan.nodes.get(childIds[0])!;
    const childB = plan.nodes.get(childIds[1])!;

    assert.equal(childA.goal, "Sub A");
    assert.equal(childA.depth, 1);
    assert.equal(childA.parentId, plan.rootId);

    assert.equal(childB.goal, "Sub B");
    assert.equal(childB.depth, 1);

    const root = plan.nodes.get(plan.rootId)!;
    assert.equal(root.status, "decomposed");
    assert.deepStrictEqual(root.children, childIds);
  });
});
