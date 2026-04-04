/**
 * HTN Planner — Hierarchical Task Network with lazy decomposition.
 *
 * Core principle: Don't decompose upfront. Try executing at current granularity first,
 * only decompose further when execution fails. Supports backtracking to parent goals.
 *
 * Based on: ADaPT (NAACL 2024) lazy decomposition + ChatHTN (ICAPS 2025) symbolic+LLM hybrid.
 */

import type { HTNGoalNode, HTNPlan, HTNNodeStatus } from "../cognition/types";

export function createHTNPlan(goal: string): HTNPlan {
  const rootId = `htn-root-${Date.now().toString(36)}`;
  const root: HTNGoalNode = {
    id: rootId,
    goal,
    children: [],
    status: "pending",
    depth: 0,
    maxDecomposeAttempts: 3,
    decomposeAttempts: 0
  };
  const nodes = new Map<string, HTNGoalNode>();
  nodes.set(rootId, root);
  return { nodes, rootId };
}

/**
 * Decompose a goal node into sub-goals.
 * Returns the new child node IDs.
 */
export function decomposeNode(
  plan: HTNPlan,
  nodeId: string,
  subGoals: string[]
): string[] {
  const node = plan.nodes.get(nodeId);
  if (!node) throw new Error(`HTN node ${nodeId} not found`);
  if (node.decomposeAttempts >= node.maxDecomposeAttempts) {
    return []; // exhausted decomposition budget
  }

  node.decomposeAttempts += 1;
  node.status = "decomposed";

  // Clear previous children if re-decomposing
  node.children = [];

  const childIds: string[] = [];
  for (let i = 0; i < subGoals.length; i++) {
    const childId = `${nodeId}-${i}-${Date.now().toString(36)}`;
    const child: HTNGoalNode = {
      id: childId,
      goal: subGoals[i],
      parentId: nodeId,
      children: [],
      status: "pending",
      depth: node.depth + 1,
      maxDecomposeAttempts: Math.max(1, node.maxDecomposeAttempts - 1),
      decomposeAttempts: 0
    };
    plan.nodes.set(childId, child);
    childIds.push(childId);
  }

  node.children = childIds;
  return childIds;
}

/**
 * Get the next pending leaf node to execute.
 * Depth-first traversal, returns the leftmost pending leaf.
 */
export function getNextExecutableNode(plan: HTNPlan): HTNGoalNode | null {
  return findNextLeaf(plan, plan.rootId);
}

function findNextLeaf(plan: HTNPlan, nodeId: string): HTNGoalNode | null {
  const node = plan.nodes.get(nodeId);
  if (!node) return null;

  // If this node has children, recurse into them
  if (node.children.length > 0) {
    for (const childId of node.children) {
      const child = plan.nodes.get(childId);
      if (!child) continue;
      if (child.status === "done") continue;
      if (child.status === "failed") continue;
      const result = findNextLeaf(plan, childId);
      if (result) return result;
    }
    return null; // all children done or failed
  }

  // Leaf node
  if (node.status === "pending") return node;
  return null;
}

/**
 * Mark a node as completed successfully.
 * Propagates success up to parent if all siblings are done.
 */
export function markNodeDone(plan: HTNPlan, nodeId: string): void {
  const node = plan.nodes.get(nodeId);
  if (!node) return;
  node.status = "done";
  node.result = { success: true };
  propagateStatus(plan, node);
}

/**
 * Mark a node as failed.
 * Returns the parent node if backtracking is possible, null otherwise.
 */
export function markNodeFailed(
  plan: HTNPlan,
  nodeId: string,
  error: string
): HTNGoalNode | null {
  const node = plan.nodes.get(nodeId);
  if (!node) return null;
  node.status = "failed";
  node.result = { success: false, error };

  // Can we backtrack to parent and re-decompose?
  if (node.parentId) {
    const parent = plan.nodes.get(node.parentId);
    if (parent && parent.decomposeAttempts < parent.maxDecomposeAttempts) {
      // Reset parent for re-decomposition
      parent.status = "pending";
      parent.children = [];
      return parent; // caller should try alternative decomposition
    }
    // Parent exhausted — propagate failure up
    if (parent && parent.status !== "failed") {
      markNodeFailed(plan, node.parentId, `Child "${node.goal}" failed: ${error}`);
    }
  }

  return null;
}

/**
 * Check if the plan is fully completed (all nodes done or the root is done).
 */
export function isPlanComplete(plan: HTNPlan): boolean {
  const root = plan.nodes.get(plan.rootId);
  return root?.status === "done";
}

/**
 * Check if the plan has completely failed (root failed, no backtrack possible).
 */
export function isPlanFailed(plan: HTNPlan): boolean {
  const root = plan.nodes.get(plan.rootId);
  return root?.status === "failed";
}

/**
 * Get summary of plan state for debugging.
 */
export function getPlanSummary(plan: HTNPlan): {
  totalNodes: number;
  done: number;
  failed: number;
  pending: number;
  decomposed: number;
  maxDepth: number;
} {
  let done = 0, failed = 0, pending = 0, decomposed = 0, maxDepth = 0;
  for (const node of plan.nodes.values()) {
    if (node.status === "done") done++;
    else if (node.status === "failed") failed++;
    else if (node.status === "decomposed") decomposed++;
    else pending++;
    if (node.depth > maxDepth) maxDepth = node.depth;
  }
  return { totalNodes: plan.nodes.size, done, failed, pending, decomposed, maxDepth };
}

function propagateStatus(plan: HTNPlan, node: HTNGoalNode): void {
  if (!node.parentId) return;
  const parent = plan.nodes.get(node.parentId);
  if (!parent) return;

  // Check if all children are done
  const allDone = parent.children.every(id => {
    const child = plan.nodes.get(id);
    return child?.status === "done";
  });

  if (allDone) {
    parent.status = "done";
    parent.result = { success: true };
    propagateStatus(plan, parent);
  }
}
