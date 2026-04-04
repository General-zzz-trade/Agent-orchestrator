import test from "node:test";
import assert from "node:assert/strict";

import {
  createHTNPlan,
  decomposeNode,
  getNextExecutableNode,
  markNodeDone,
  markNodeFailed,
  isPlanComplete,
  isPlanFailed,
  getPlanSummary
} from "./htn-planner";

test("createHTNPlan creates root node", () => {
  const plan = createHTNPlan("Book a flight");
  const root = plan.nodes.get(plan.rootId);
  assert.ok(root, "root node should exist");
  assert.equal(root.goal, "Book a flight");
  assert.equal(root.status, "pending");
  assert.equal(root.depth, 0);
  assert.equal(root.children.length, 0);
  assert.equal(root.decomposeAttempts, 0);
  assert.equal(root.maxDecomposeAttempts, 3);
  assert.equal(root.parentId, undefined);
  assert.equal(plan.nodes.size, 1);
});

test("decomposeNode creates child nodes", () => {
  const plan = createHTNPlan("Book a flight");
  const childIds = decomposeNode(plan, plan.rootId, [
    "Search flights",
    "Select flight",
    "Enter payment"
  ]);

  assert.equal(childIds.length, 3);
  assert.equal(plan.nodes.size, 4); // root + 3 children

  const root = plan.nodes.get(plan.rootId)!;
  assert.equal(root.status, "decomposed");
  assert.deepEqual(root.children, childIds);
  assert.equal(root.decomposeAttempts, 1);

  for (const id of childIds) {
    const child = plan.nodes.get(id)!;
    assert.ok(child);
    assert.equal(child.parentId, plan.rootId);
    assert.equal(child.status, "pending");
    assert.equal(child.depth, 1);
    assert.equal(child.maxDecomposeAttempts, 2); // parent was 3, child gets max(1, 3-1)
  }
});

test("decomposeNode returns empty array when budget exhausted", () => {
  const plan = createHTNPlan("Do something");
  // Decompose 3 times (the max)
  decomposeNode(plan, plan.rootId, ["A"]);
  decomposeNode(plan, plan.rootId, ["B"]);
  decomposeNode(plan, plan.rootId, ["C"]);

  const result = decomposeNode(plan, plan.rootId, ["D"]);
  assert.equal(result.length, 0);
});

test("decomposeNode throws for unknown node", () => {
  const plan = createHTNPlan("goal");
  assert.throws(() => decomposeNode(plan, "nonexistent", ["A"]), /not found/);
});

test("getNextExecutableNode returns leftmost pending leaf", () => {
  const plan = createHTNPlan("Root goal");
  const children = decomposeNode(plan, plan.rootId, ["A", "B", "C"]);

  const next = getNextExecutableNode(plan);
  assert.ok(next);
  assert.equal(next.id, children[0]);
  assert.equal(next.goal, "A");
});

test("getNextExecutableNode skips done nodes", () => {
  const plan = createHTNPlan("Root goal");
  const children = decomposeNode(plan, plan.rootId, ["A", "B", "C"]);

  markNodeDone(plan, children[0]);
  const next = getNextExecutableNode(plan);
  assert.ok(next);
  assert.equal(next.id, children[1]);
});

test("getNextExecutableNode returns null when all done", () => {
  const plan = createHTNPlan("Root goal");
  const children = decomposeNode(plan, plan.rootId, ["A", "B"]);
  markNodeDone(plan, children[0]);
  markNodeDone(plan, children[1]);

  const next = getNextExecutableNode(plan);
  assert.equal(next, null);
});

test("getNextExecutableNode recurses into decomposed children", () => {
  const plan = createHTNPlan("Root");
  const level1 = decomposeNode(plan, plan.rootId, ["L1-A", "L1-B"]);
  const level2 = decomposeNode(plan, level1[0], ["L2-A", "L2-B"]);

  const next = getNextExecutableNode(plan);
  assert.ok(next);
  assert.equal(next.id, level2[0]);
  assert.equal(next.goal, "L2-A");
});

test("markNodeDone propagates to parent when all siblings done", () => {
  const plan = createHTNPlan("Root");
  const children = decomposeNode(plan, plan.rootId, ["A", "B"]);

  markNodeDone(plan, children[0]);
  const root = plan.nodes.get(plan.rootId)!;
  assert.equal(root.status, "decomposed"); // not all done yet

  markNodeDone(plan, children[1]);
  assert.equal(root.status, "done");
  assert.deepEqual(root.result, { success: true });
});

test("markNodeDone propagates through multiple levels", () => {
  const plan = createHTNPlan("Root");
  const level1 = decomposeNode(plan, plan.rootId, ["L1"]);
  const level2 = decomposeNode(plan, level1[0], ["L2"]);

  markNodeDone(plan, level2[0]);

  const l1Node = plan.nodes.get(level1[0])!;
  const rootNode = plan.nodes.get(plan.rootId)!;
  assert.equal(l1Node.status, "done");
  assert.equal(rootNode.status, "done");
});

test("markNodeFailed returns parent for backtracking", () => {
  const plan = createHTNPlan("Root");
  const children = decomposeNode(plan, plan.rootId, ["A", "B"]);

  const backtrackTo = markNodeFailed(plan, children[0], "element not found");
  assert.ok(backtrackTo);
  assert.equal(backtrackTo.id, plan.rootId);
  assert.equal(backtrackTo.status, "pending"); // reset for re-decomposition
  assert.equal(backtrackTo.children.length, 0); // children cleared
});

test("markNodeFailed returns null when decomposition budget exhausted", () => {
  const plan = createHTNPlan("Root");

  // Use up all decomposition attempts on root
  decomposeNode(plan, plan.rootId, ["A1"]);
  const c2 = decomposeNode(plan, plan.rootId, ["A2"]);
  const c3 = decomposeNode(plan, plan.rootId, ["A3"]);
  // root now has 3 decomposeAttempts == maxDecomposeAttempts

  const backtrackTo = markNodeFailed(plan, c3[0], "still failing");
  assert.equal(backtrackTo, null);
});

test("markNodeFailed returns null for root node failure", () => {
  const plan = createHTNPlan("Root");
  const result = markNodeFailed(plan, plan.rootId, "total failure");
  assert.equal(result, null);
  assert.equal(plan.nodes.get(plan.rootId)!.status, "failed");
});

test("isPlanComplete returns true when root is done", () => {
  const plan = createHTNPlan("Root");
  assert.equal(isPlanComplete(plan), false);

  markNodeDone(plan, plan.rootId);
  assert.equal(isPlanComplete(plan), true);
});

test("isPlanComplete returns true after all children complete", () => {
  const plan = createHTNPlan("Root");
  const children = decomposeNode(plan, plan.rootId, ["A", "B"]);
  assert.equal(isPlanComplete(plan), false);

  markNodeDone(plan, children[0]);
  assert.equal(isPlanComplete(plan), false);

  markNodeDone(plan, children[1]);
  assert.equal(isPlanComplete(plan), true);
});

test("isPlanFailed returns true when root has failed", () => {
  const plan = createHTNPlan("Root");
  assert.equal(isPlanFailed(plan), false);

  markNodeFailed(plan, plan.rootId, "failed");
  assert.equal(isPlanFailed(plan), true);
});

test("getPlanSummary returns correct counts", () => {
  const plan = createHTNPlan("Root");
  const children = decomposeNode(plan, plan.rootId, ["A", "B", "C"]);

  markNodeDone(plan, children[0]);
  markNodeFailed(plan, children[1], "err");
  // children[2] stays pending, root is decomposed (since backtrack resets it to pending actually)
  // After markNodeFailed on children[1], parent (root) was reset to pending since budget allows

  const summary = getPlanSummary(plan);
  assert.equal(summary.totalNodes, plan.nodes.size);
  assert.ok(summary.done >= 1);
  assert.ok(summary.maxDepth >= 1);
});

test("getPlanSummary on fresh plan", () => {
  const plan = createHTNPlan("Root");
  const summary = getPlanSummary(plan);
  assert.equal(summary.totalNodes, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.done, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.decomposed, 0);
  assert.equal(summary.maxDepth, 0);
});
