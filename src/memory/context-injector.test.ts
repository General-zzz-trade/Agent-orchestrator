import test from "node:test";
import assert from "node:assert/strict";
import { formatContextForPrompt } from "./context-injector";
import type { InjectedContext } from "./context-injector";

test("formatContextForPrompt produces structured output with all sections", () => {
  const context: InjectedContext = {
    episodeSummaries: [
      "[success] Login to app — Logged in successfully (similarity: 0.92)",
      "[failure] Login to app — Timed out waiting for dashboard (similarity: 0.85)",
    ],
    relevantLessons: [
      'When "click" fails with "element not found": use visual_click fallback',
      'When "type" fails with "input not visible": scroll element into view first',
    ],
    selectorHints: [
      '"login button" => #btn-login (12 successes)',
      '"username field" => input[name="user"] (8 successes)',
    ],
    failureWarnings: [
      'click on any domain: "timeout" — add wait before click',
    ],
    injectedAt: new Date().toISOString(),
  };

  const output = formatContextForPrompt(context);

  assert.ok(output.includes("# Injected Context from Past Experience"));
  assert.ok(output.includes("## Past Experience"));
  assert.ok(output.includes("## Lessons Learned"));
  assert.ok(output.includes("## Known Selectors"));
  assert.ok(output.includes("## Failure Warnings"));
  assert.ok(output.includes("similarity: 0.92"));
  assert.ok(output.includes("visual_click fallback"));
  assert.ok(output.includes("#btn-login"));
  assert.ok(output.includes("WARNING:"));
});

test("formatContextForPrompt returns empty string when no context", () => {
  const emptyContext: InjectedContext = {
    episodeSummaries: [],
    relevantLessons: [],
    selectorHints: [],
    failureWarnings: [],
    injectedAt: new Date().toISOString(),
  };

  const output = formatContextForPrompt(emptyContext);
  assert.equal(output, "");
});
