import test from "node:test";
import assert from "node:assert/strict";
import { callOpenAICompatible, callAnthropic, readProviderConfig } from "./provider";
import type { RetryConfig } from "./provider";
import { withEnv, withMockedFetch, jsonResponse } from "../provider-smoke.utils";

test("readProviderConfig: kimi-k2.5 on moonshot defaults temperature to 1", async () => {
  await withEnv(
    {
      LLM_TEST_PROVIDER: "openai-compatible",
      LLM_TEST_MODEL: "kimi-k2.5",
      LLM_TEST_BASE_URL: "https://api.moonshot.ai/v1"
    },
    async () => {
      const config = readProviderConfig("LLM_TEST");
      assert.equal(config.temperature, 1);
    }
  );
});

test("callOpenAICompatible: appends chat completions to v1 base url", async () => {
  let requestedUrl = "";

  await withMockedFetch(
    async (input) => {
      requestedUrl = String(input);
      return jsonResponse({
        choices: [{ message: { content: "{\"tasks\":[]}" } }]
      });
    },
    async () => {
      await callOpenAICompatible(
        {
          provider: "openai-compatible",
          model: "kimi-k2.5",
          timeoutMs: 1000,
          maxTokens: 100,
          temperature: 1,
          apiKey: "test-key",
          baseUrl: "https://api.moonshot.ai/v1"
        },
        [{ role: "user", content: "hello" }],
        "provider test"
      );
    }
  );

  assert.equal(requestedUrl, "https://api.moonshot.ai/v1/chat/completions");
});

test("parseOpenAIUsage extracts prompt and completion tokens", () => {
  const { parseOpenAIUsage } = require("./provider");
  const usage = parseOpenAIUsage({ prompt_tokens: 100, completion_tokens: 50 });
  assert.equal(usage.inputTokens, 100);
  assert.equal(usage.outputTokens, 50);
});

test("parseAnthropicUsage extracts input and output tokens", () => {
  const { parseAnthropicUsage } = require("./provider");
  const usage = parseAnthropicUsage({ input_tokens: 200, output_tokens: 80 });
  assert.equal(usage.inputTokens, 200);
  assert.equal(usage.outputTokens, 80);
});

test("parseOpenAIUsage returns zeros for missing data", () => {
  const { parseOpenAIUsage } = require("./provider");
  const usage = parseOpenAIUsage(undefined);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
});

test("parseAnthropicUsage returns zeros for missing data", () => {
  const { parseAnthropicUsage } = require("./provider");
  const usage = parseAnthropicUsage(null);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
});

// ── Retry logic tests ──────────────────────────────────────────────────────

const FAST_RETRY: RetryConfig = { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5, jitterFactor: 0 };
const BASE_CONFIG = {
  provider: "openai-compatible" as const,
  model: "test",
  timeoutMs: 2000,
  maxTokens: 100,
  temperature: 0,
  apiKey: "key",
  baseUrl: "https://api.example.com/v1"
};
const OK_OPENAI = { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };

test("callOpenAICompatible: retries on HTTP 500 then succeeds", async () => {
  let callCount = 0;
  await withMockedFetch(
    async () => {
      callCount++;
      if (callCount < 3) return jsonResponse({ error: "server error" }, 500);
      return jsonResponse(OK_OPENAI);
    },
    async () => {
      const result = await callOpenAICompatible(BASE_CONFIG, [{ role: "user", content: "hi" }], "test", FAST_RETRY);
      assert.equal(callCount, 3);
      assert.equal(result.content, '{"ok":true}');
    }
  );
});

test("callOpenAICompatible: retries on HTTP 429 then succeeds", async () => {
  let callCount = 0;
  await withMockedFetch(
    async () => {
      callCount++;
      if (callCount === 1) return jsonResponse({ error: "rate limited" }, 429);
      return jsonResponse(OK_OPENAI);
    },
    async () => {
      const result = await callOpenAICompatible(BASE_CONFIG, [{ role: "user", content: "hi" }], "test", FAST_RETRY);
      assert.equal(callCount, 2);
      assert.ok(result.content);
    }
  );
});

test("callOpenAICompatible: does NOT retry on HTTP 400", async () => {
  let callCount = 0;
  await withMockedFetch(
    async () => {
      callCount++;
      return jsonResponse({ error: "bad request" }, 400);
    },
    async () => {
      await assert.rejects(
        () => callOpenAICompatible(BASE_CONFIG, [{ role: "user", content: "hi" }], "test", FAST_RETRY),
        (err: Error) => err.message.includes("HTTP 400")
      );
      assert.equal(callCount, 1);
    }
  );
});

test("callOpenAICompatible: does NOT retry on HTTP 401", async () => {
  let callCount = 0;
  await withMockedFetch(
    async () => {
      callCount++;
      return jsonResponse({ error: "unauthorized" }, 401);
    },
    async () => {
      await assert.rejects(
        () => callOpenAICompatible(BASE_CONFIG, [{ role: "user", content: "hi" }], "test", FAST_RETRY),
        (err: Error) => err.message.includes("HTTP 401")
      );
      assert.equal(callCount, 1);
    }
  );
});

test("callOpenAICompatible: exhausts retries and throws", async () => {
  let callCount = 0;
  await withMockedFetch(
    async () => {
      callCount++;
      return jsonResponse({ error: "overloaded" }, 503);
    },
    async () => {
      await assert.rejects(
        () => callOpenAICompatible(BASE_CONFIG, [{ role: "user", content: "hi" }], "test", FAST_RETRY),
        (err: Error) => err.message.includes("HTTP 503")
      );
      assert.equal(callCount, 4); // 1 initial + 3 retries
    }
  );
});

test("callOpenAICompatible: retries on timeout then throws", async () => {
  let callCount = 0;
  const shortTimeoutConfig = { ...BASE_CONFIG, timeoutMs: 10 };
  const noRetry: RetryConfig = { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 };
  await withMockedFetch(
    async (_input, init) => {
      callCount++;
      // Wait for abort signal to fire
      return new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }
      });
    },
    async () => {
      await assert.rejects(
        () => callOpenAICompatible(shortTimeoutConfig, [{ role: "user", content: "hi" }], "test", noRetry),
        (err: Error) => err.message.includes("timed out")
      );
      assert.equal(callCount, 2); // 1 initial + 1 retry
    }
  );
});

test("callAnthropic: retries on HTTP 529 then succeeds", async () => {
  let callCount = 0;
  const anthropicConfig = { ...BASE_CONFIG, provider: "anthropic", baseUrl: "https://api.anthropic.com" };
  const okAnthropic = { content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 10, output_tokens: 5 } };

  await withMockedFetch(
    async () => {
      callCount++;
      if (callCount === 1) return jsonResponse({ error: "overloaded" }, 529);
      return jsonResponse(okAnthropic);
    },
    async () => {
      const result = await callAnthropic(anthropicConfig, [{ role: "user", content: "hi" }], "test", FAST_RETRY);
      assert.equal(callCount, 2);
      assert.equal(result.content, '{"ok":true}');
    }
  );
});
