import test from "node:test";
import assert from "node:assert/strict";
import { isNaturalLanguageGoal, planFromNaturalLanguage, extractUrlFromGoal } from "./nl-planner";
import { withEnv, withMockedFetch, jsonResponse } from "../provider-smoke.utils";

// ---------------------------------------------------------------------------
// isNaturalLanguageGoal
// ---------------------------------------------------------------------------

test("isNaturalLanguageGoal: returns true for plain English goals", () => {
  assert.ok(isNaturalLanguageGoal("register a new user"));
  assert.ok(isNaturalLanguageGoal("log in and check the dashboard"));
  assert.ok(isNaturalLanguageGoal("search for flights to Paris"));
  assert.ok(isNaturalLanguageGoal("fill out the contact form"));
});

test("isNaturalLanguageGoal: returns false for DSL with start app and click", () => {
  assert.equal(
    isNaturalLanguageGoal('start app "npm run dev" and click "#btn"'),
    false
  );
});

test("isNaturalLanguageGoal: returns false for DSL with open page", () => {
  assert.equal(
    isNaturalLanguageGoal('open page "http://example.com"'),
    false
  );
});

test("isNaturalLanguageGoal: returns false for empty or single-word input", () => {
  assert.equal(isNaturalLanguageGoal(""), false);
  assert.equal(isNaturalLanguageGoal("login"), false);
});

// ---------------------------------------------------------------------------
// extractUrlFromGoal
// ---------------------------------------------------------------------------

test("extractUrlFromGoal: extracts URL when present", () => {
  assert.equal(
    extractUrlFromGoal("go to http://localhost:3000 and register"),
    "http://localhost:3000"
  );
  assert.equal(extractUrlFromGoal("register a new user"), undefined);
});

// ---------------------------------------------------------------------------
// planFromNaturalLanguage
// ---------------------------------------------------------------------------

test("planFromNaturalLanguage: returns empty array when no LLM configured", async () => {
  await withEnv(
    {
      LLM_PLANNER_PROVIDER: undefined,
      LLM_PLANNER_API_KEY: undefined,
      LLM_PLANNER_BASE_URL: undefined,
    },
    async () => {
      const result = await planFromNaturalLanguage("register a new user");
      assert.deepEqual(result, []);
    }
  );
});

test("planFromNaturalLanguage: returns valid blueprints from mock LLM", async () => {
  const mockResponse = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            tasks: [
              { type: "open_page", payload: { url: "http://localhost:3000/register" } },
              { type: "type", payload: { selector: "#username", text: "testuser" } },
              { type: "type", payload: { selector: "#password", text: "pass123" } },
              { type: "click", payload: { selector: "#register-btn" } },
              { type: "assert_text", payload: { text: "Welcome", timeoutMs: 5000 } },
            ],
          }),
        },
      },
    ],
  };

  await withEnv(
    {
      LLM_PLANNER_PROVIDER: "openai-compatible",
      LLM_PLANNER_API_KEY: "test-key",
      LLM_PLANNER_BASE_URL: "http://fake-llm:8080",
      LLM_PLANNER_MODEL: "test-model",
      DISABLE_PROMPT_EVOLUTION: "1",
    },
    async () => {
      await withMockedFetch(
        () => jsonResponse(mockResponse),
        async () => {
          const result = await planFromNaturalLanguage("register a new user", {
            appUrl: "http://localhost:3000",
          });
          assert.ok(result.length > 0, "should return task blueprints");
          assert.equal(result[0].type, "open_page");
          assert.equal(result[result.length - 1].type, "assert_text");
          // All types should be valid planner types
          for (const task of result) {
            assert.ok(typeof task.type === "string");
            assert.ok(typeof task.payload === "object");
          }
        }
      );
    }
  );
});
