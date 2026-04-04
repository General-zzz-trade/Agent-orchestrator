import test from "node:test";
import assert from "node:assert/strict";
import {
  selectPlannerThompson,
  recordPlannerOutcome,
  getPlannerStats,
  resetPlannerStats
} from "./thompson-sampling";

test("selectPlannerThompson returns a candidate from the list", () => {
  resetPlannerStats();
  const candidates = ["template", "regex", "llm"];
  const result = selectPlannerThompson(candidates, "navigation");
  assert.ok(candidates.includes(result.selected), `Selected ${result.selected} should be in candidates`);
  assert.ok(typeof result.score === "number");
  assert.ok(typeof result.explored === "boolean");
});

test("recordPlannerOutcome updates beliefs", () => {
  resetPlannerStats();
  recordPlannerOutcome("template", "navigation", true, 100);
  const stats = getPlannerStats();
  const templateStat = stats.find((s) => s.planner === "template" && s.goalCategory === "navigation");
  assert.ok(templateStat);
  // Started at alpha=1, beta=1; one success -> alpha=2, beta=1
  assert.equal(templateStat!.belief.alpha, 2);
  assert.equal(templateStat!.belief.beta, 1);
  assert.equal(templateStat!.totalTokens, 100);
});

test("recordPlannerOutcome tracks failures", () => {
  resetPlannerStats();
  recordPlannerOutcome("llm", "form_fill", false, 500);
  const stats = getPlannerStats();
  const llmStat = stats.find((s) => s.planner === "llm" && s.goalCategory === "form_fill");
  assert.ok(llmStat);
  // Started at alpha=1, beta=1; one failure -> alpha=1, beta=2
  assert.equal(llmStat!.belief.alpha, 1);
  assert.equal(llmStat!.belief.beta, 2);
});

test("unknown planners get explored (explored flag is true)", () => {
  resetPlannerStats();
  // Record some data for "template" but not for "regex" or "llm"
  recordPlannerOutcome("template", "navigation", true, 0);
  recordPlannerOutcome("template", "navigation", true, 0);

  // Run selection multiple times; unknown planners should sometimes be explored
  let exploredCount = 0;
  for (let i = 0; i < 50; i++) {
    const result = selectPlannerThompson(["template", "unknown_planner"], "navigation");
    if (result.selected === "unknown_planner") {
      exploredCount++;
      assert.equal(result.explored, true, "Unknown planner selection should mark explored=true");
    }
  }
  // With random sampling, unknown planner should be selected at least sometimes
  assert.ok(exploredCount > 0, `Unknown planner should be explored at least once in 50 tries, got ${exploredCount}`);
});

test("after many successes, high-success planner is preferred", () => {
  resetPlannerStats();

  // Give "template" a strong track record
  for (let i = 0; i < 20; i++) {
    recordPlannerOutcome("template", "navigation", true, 10);
  }
  // Give "regex" a poor track record
  for (let i = 0; i < 20; i++) {
    recordPlannerOutcome("regex", "navigation", false, 10);
  }

  // Over many selections, "template" should be chosen most of the time
  let templateCount = 0;
  const trials = 100;
  for (let i = 0; i < trials; i++) {
    const result = selectPlannerThompson(["template", "regex"], "navigation");
    if (result.selected === "template") templateCount++;
  }
  // template has alpha=21, beta=1 (mean ~0.95)
  // regex has alpha=1, beta=21 (mean ~0.05)
  // template should win overwhelmingly
  assert.ok(templateCount > 80,
    `Template should be selected >80% of the time but was selected ${templateCount}/${trials}`);
});

test("resetPlannerStats clears all stats", () => {
  resetPlannerStats();
  recordPlannerOutcome("template", "navigation", true, 100);
  assert.ok(getPlannerStats().length > 0);
  resetPlannerStats();
  assert.equal(getPlannerStats().length, 0);
});

test("different goal categories have independent beliefs", () => {
  resetPlannerStats();
  recordPlannerOutcome("template", "navigation", true, 0);
  recordPlannerOutcome("template", "form_fill", false, 0);

  const stats = getPlannerStats();
  const navStat = stats.find((s) => s.planner === "template" && s.goalCategory === "navigation");
  const formStat = stats.find((s) => s.planner === "template" && s.goalCategory === "form_fill");

  assert.ok(navStat);
  assert.ok(formStat);
  assert.equal(navStat!.belief.alpha, 2); // 1 + 1 success
  assert.equal(navStat!.belief.beta, 1);
  assert.equal(formStat!.belief.alpha, 1);
  assert.equal(formStat!.belief.beta, 2); // 1 + 1 failure
});
