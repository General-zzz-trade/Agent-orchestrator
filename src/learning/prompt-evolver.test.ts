import test from "node:test";
import assert from "node:assert/strict";
import {
  registerBasePrompt,
  addVariant,
  selectPrompt,
  recordPromptOutcome,
  getBestVariant,
  pruneVariants,
  getVariants,
  resetVariants
} from "./prompt-evolver";

test("registerBasePrompt creates variant with optimistic prior", () => {
  resetVariants();
  const v = registerBasePrompt("planner", "You are a planner.");
  assert.equal(v.id, "prompt-planner-base");
  assert.equal(v.role, "planner");
  assert.equal(v.belief.alpha, 2);
  assert.equal(v.belief.beta, 1);
  assert.equal(v.successCount, 0);
  assert.equal(v.failureCount, 0);

  // Should not duplicate on re-register
  registerBasePrompt("planner", "You are a planner v2.");
  assert.equal(getVariants("planner").length, 1);
});

test("addVariant creates variant with uninformative prior", () => {
  resetVariants();
  const v = addVariant("replanner", "You are an improved replanner.");
  assert.equal(v.role, "replanner");
  assert.equal(v.belief.alpha, 1);
  assert.equal(v.belief.beta, 1);
  assert.ok(v.id.startsWith("prompt-replanner-"));
});

test("selectPrompt returns a variant from pool", () => {
  resetVariants();
  registerBasePrompt("diagnoser", "Base diagnoser prompt.");
  addVariant("diagnoser", "Variant A.");
  addVariant("diagnoser", "Variant B.");

  const selected = selectPrompt("diagnoser");
  assert.ok(selected !== null);
  assert.equal(selected.role, "diagnoser");

  // Returns null for empty role
  assert.equal(selectPrompt("planner"), null);
});

test("recordPromptOutcome updates belief alpha on success", () => {
  resetVariants();
  const v = registerBasePrompt("planner", "Base planner.");
  const initialAlpha = v.belief.alpha;

  recordPromptOutcome(v.id, true);

  const variants = getVariants("planner");
  const updated = variants.find(x => x.id === v.id)!;
  assert.equal(updated.belief.alpha, initialAlpha + 1);
  assert.equal(updated.successCount, 1);
});

test("recordPromptOutcome updates belief beta on failure", () => {
  resetVariants();
  const v = registerBasePrompt("planner", "Base planner.");
  const initialBeta = v.belief.beta;

  recordPromptOutcome(v.id, false);

  const variants = getVariants("planner");
  const updated = variants.find(x => x.id === v.id)!;
  assert.equal(updated.belief.beta, initialBeta + 1);
  assert.equal(updated.failureCount, 1);
});

test("getBestVariant returns highest posterior mean", () => {
  resetVariants();
  const base = registerBasePrompt("planner", "Base.");       // alpha=2, beta=1 => mean=0.667
  const good = addVariant("planner", "Good variant.");       // alpha=1, beta=1 => mean=0.5

  // Make the second variant much better
  for (let i = 0; i < 10; i++) {
    recordPromptOutcome(good.id, true);
  }
  // good now: alpha=11, beta=1 => mean=0.917

  const best = getBestVariant("planner");
  assert.ok(best !== null);
  assert.equal(best.id, good.id);
});

test("pruneVariants removes underperformers", () => {
  resetVariants();
  registerBasePrompt("planner", "Base.");
  for (let i = 0; i < 7; i++) {
    const v = addVariant("planner", `Variant ${i}.`);
    // Give each a different success rate
    for (let j = 0; j < i; j++) {
      recordPromptOutcome(v.id, true);
    }
  }

  assert.equal(getVariants("planner").length, 8); // 1 base + 7 added
  const removed = pruneVariants("planner", 3);
  assert.equal(removed, 5);
  assert.equal(getVariants("planner").length, 3);
});

test("resetVariants clears all variants", () => {
  resetVariants();
  registerBasePrompt("planner", "Base.");
  addVariant("replanner", "Variant.");
  assert.ok(getVariants("planner").length > 0);
  assert.ok(getVariants("replanner").length > 0);

  resetVariants();
  assert.equal(getVariants("planner").length, 0);
  assert.equal(getVariants("replanner").length, 0);
});
