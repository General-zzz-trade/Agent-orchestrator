import test from "node:test";
import assert from "node:assert/strict";
import { curiosityScore, selectNextExplorationAction, explore } from "./proactive-explorer";
import { createCausalGraph, addStateNode, addCausalEdge } from "../world-model/causal-graph";

test("curiosityScore ranks novel elements higher than explored ones", () => {
  const graph = createCausalGraph();
  addStateNode(graph, "page:home", "test.com");

  const visitCounts = new Map<string, number>();
  visitCounts.set("page:home", 5); // well-visited

  const novelElement = { selector: "#new-btn", text: "New Feature", type: "button" };
  const knownElement = { selector: "#old-btn", text: "Old", type: "button" };

  // Add an edge for the known element so it's no longer novel
  addCausalEdge(graph, "page:home", "page:feature", "click", "#old-btn", "test.com", true);

  const novelScore = curiosityScore(novelElement, "page:home", graph, visitCounts);
  const knownScore = curiosityScore(knownElement, "page:home", graph, visitCounts);

  assert.ok(
    novelScore > knownScore,
    `novel element score (${novelScore.toFixed(2)}) should be higher than known (${knownScore.toFixed(2)})`
  );
});

test("selectNextExplorationAction returns stop when no elements", () => {
  const graph = createCausalGraph();
  const visitCounts = new Map<string, number>();

  const decision = selectNextExplorationAction("page:empty", graph, visitCounts, []);
  assert.equal(decision.action, "stop");
  assert.ok(decision.reason.includes("No actionable elements"));
});

test("explore discovers states and builds edges in the causal graph", async () => {
  const graph = createCausalGraph();
  let currentPage = "https://test.com/home";
  let stateIndex = 0;
  const states = ["page:home", "page:about", "page:contact"];

  const result = await explore(
    "page:home",
    "test.com",
    graph,
    { maxSteps: 3 },
    {
      getElements: async () => {
        if (stateIndex >= states.length - 1) return [];
        return [
          { selector: `#link-${stateIndex}`, text: `Link ${stateIndex}`, type: "link" as const },
        ];
      },
      performAction: async (_action, _target) => {
        stateIndex++;
        currentPage = `https://test.com/${states[stateIndex]?.replace("page:", "") ?? "end"}`;
        return states[stateIndex] ?? "page:end";
      },
      getCurrentPage: () => currentPage,
    }
  );

  assert.ok(result.pagesVisited.length >= 1, "should visit at least one page");
  assert.ok(result.edgesLearned >= 1, "should learn at least one edge");
  assert.ok(result.statesDiscovered >= 2, "should discover at least 2 states");
  assert.ok(graph.nodes.size >= 2, "causal graph should have nodes");
  assert.ok(graph.edges.size >= 1, "causal graph should have edges");
});
