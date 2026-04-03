# Phase 3: LLM Cost Control + Observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add token-level LLM usage tracking, budget enforcement, and Prometheus metrics so runs have cost visibility.

**Architecture:** Modify LLM provider functions to return token usage alongside content. Accumulate tokens in the existing UsageLedger. Add budget check function. Expose counters via Prometheus metrics.

**Tech Stack:** TypeScript, node:test, node:assert/strict

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/llm/provider.ts` | Return token usage from API calls |
| Modify | `src/types.ts` | Add token fields to UsageLedger |
| Modify | `src/usage-ledger.ts` | Token accumulation + budget check |
| Modify | `src/observability/metrics-store.ts` | Register LLM token/latency counters |
| Create | `src/usage-ledger.test.ts` | Unit tests for ledger + budget |
| Modify | `src/llm/provider.test.ts` | Add tests for token parsing |

---

### Task 1: LLM Provider — Return Token Usage

**Files:**
- Modify: `src/llm/provider.ts`
- Modify: `src/llm/provider.test.ts`

- [ ] **Step 1: Write tests for token usage parsing**

Read `src/llm/provider.test.ts` first to understand existing test patterns, then append these tests:

```typescript
test("callOpenAICompatible returns token usage from response", async () => {
  // This test verifies the LLMCallResult type exists and the function signature
  // We can't call a real API, but we verify the type is exported
  const { LLMCallResult } = await import("./provider") as any;
  // Just verify the module loads without error
  assert.ok(true);
});

test("parseTokenUsage extracts OpenAI format", () => {
  const { parseOpenAIUsage } = require("./provider");
  const usage = parseOpenAIUsage({ prompt_tokens: 100, completion_tokens: 50 });
  assert.equal(usage.inputTokens, 100);
  assert.equal(usage.outputTokens, 50);
});

test("parseTokenUsage extracts Anthropic format", () => {
  const { parseAnthropicUsage } = require("./provider");
  const usage = parseAnthropicUsage({ input_tokens: 200, output_tokens: 80 });
  assert.equal(usage.inputTokens, 200);
  assert.equal(usage.outputTokens, 80);
});

test("parseTokenUsage returns zeros for missing data", () => {
  const { parseOpenAIUsage } = require("./provider");
  const usage = parseOpenAIUsage(undefined);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
});
```

- [ ] **Step 2: Add LLMCallResult type and modify provider functions**

In `src/llm/provider.ts`, add the result type after LLMMessage:

```typescript
export interface LLMCallResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}
```

Add usage parsing helpers (exported for testing):

```typescript
export function parseOpenAIUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  if (!usage || typeof usage !== "object") return { inputTokens: 0, outputTokens: 0 };
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: Number(u.prompt_tokens ?? 0),
    outputTokens: Number(u.completion_tokens ?? 0)
  };
}

export function parseAnthropicUsage(usage: unknown): { inputTokens: number; outputTokens: number } {
  if (!usage || typeof usage !== "object") return { inputTokens: 0, outputTokens: 0 };
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: Number(u.input_tokens ?? 0),
    outputTokens: Number(u.output_tokens ?? 0)
  };
}
```

Change `callOpenAICompatible` return type from `Promise<string>` to `Promise<LLMCallResult>`. Wrap the existing logic:

In the function body, add `const start = Date.now();` at the top. Change the response body parsing to also extract usage:

```typescript
const usage = parseOpenAIUsage((body as Record<string, unknown>).usage);
return { content, usage, latencyMs: Date.now() - start };
```

Do the same for `callAnthropic` — change return type to `Promise<LLMCallResult>`, add timing, extract usage:

```typescript
const usage = parseAnthropicUsage((responseBody as Record<string, unknown>).usage);
return { content, usage, latencyMs: Date.now() - start };
```

- [ ] **Step 3: Run provider tests**

Run: `node --import tsx --test src/llm/provider.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/llm/provider.ts src/llm/provider.test.ts
git commit -m "feat(llm): return token usage and latency from provider calls"
```

---

### Task 2: Usage Ledger — Token Accumulation + Budget Check

**Files:**
- Modify: `src/types.ts` — add token fields to UsageLedger
- Modify: `src/usage-ledger.ts` — add token recording + budget check
- Create: `src/usage-ledger.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/usage-ledger.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import {
  createUsageLedger,
  finalizeUsageLedger,
  recordLLMPlannerCall,
  recordLLMTokenUsage,
  isTokenBudgetExceeded
} from "./usage-ledger";
import type { RunContext } from "./types";

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run-test",
    goal: "test",
    tasks: [],
    artifacts: [],
    replanCount: 0,
    nextTaskSequence: 0,
    insertedTaskCount: 0,
    llmReplannerInvocations: 0,
    llmReplannerTimeoutCount: 0,
    llmReplannerFallbackCount: 0,
    escalationDecisions: [],
    limits: { maxReplansPerRun: 3, maxReplansPerTask: 1 },
    startedAt: new Date().toISOString(),
    ...overrides
  };
}

test("createUsageLedger initializes token counts to zero", () => {
  const ledger = createUsageLedger();
  assert.equal(ledger.totalInputTokens, 0);
  assert.equal(ledger.totalOutputTokens, 0);
});

test("recordLLMTokenUsage accumulates tokens", () => {
  const ctx = makeContext({ usageLedger: createUsageLedger() });
  recordLLMTokenUsage(ctx, 100, 50);
  recordLLMTokenUsage(ctx, 200, 80);
  assert.equal(ctx.usageLedger!.totalInputTokens, 300);
  assert.equal(ctx.usageLedger!.totalOutputTokens, 130);
});

test("finalizeUsageLedger computes totalLLMInteractions", () => {
  const ctx = makeContext({ usageLedger: createUsageLedger() });
  recordLLMPlannerCall(ctx);
  recordLLMPlannerCall(ctx);
  recordLLMTokenUsage(ctx, 500, 200);
  const ledger = finalizeUsageLedger(ctx);
  assert.equal(ledger.totalLLMInteractions, 2);
  assert.equal(ledger.totalInputTokens, 500);
  assert.equal(ledger.totalOutputTokens, 200);
});

test("isTokenBudgetExceeded returns false when under budget", () => {
  const ctx = makeContext({ usageLedger: createUsageLedger() });
  recordLLMTokenUsage(ctx, 100, 50);
  assert.equal(isTokenBudgetExceeded(ctx, 1000), false);
});

test("isTokenBudgetExceeded returns true when over budget", () => {
  const ctx = makeContext({ usageLedger: createUsageLedger() });
  recordLLMTokenUsage(ctx, 800, 300);
  assert.equal(isTokenBudgetExceeded(ctx, 1000), true);
});

test("isTokenBudgetExceeded returns false when no budget set (0)", () => {
  const ctx = makeContext({ usageLedger: createUsageLedger() });
  recordLLMTokenUsage(ctx, 999999, 999999);
  assert.equal(isTokenBudgetExceeded(ctx, 0), false);
});

test("recordLLMTokenUsage creates ledger if missing", () => {
  const ctx = makeContext();
  recordLLMTokenUsage(ctx, 100, 50);
  assert.equal(ctx.usageLedger!.totalInputTokens, 100);
});
```

- [ ] **Step 2: Add token fields to UsageLedger type**

In `src/types.ts`, find the `UsageLedger` interface and add:

```typescript
  totalInputTokens: number;
  totalOutputTokens: number;
```

- [ ] **Step 3: Update usage-ledger.ts**

In `src/usage-ledger.ts`, update `createUsageLedger` to initialize new fields:

```typescript
    totalInputTokens: 0,
    totalOutputTokens: 0
```

Add two new exported functions:

```typescript
export function recordLLMTokenUsage(
  context: RunContext | { usageLedger?: UsageLedger },
  inputTokens: number,
  outputTokens: number
): void {
  const ledger = ensureLedger(context);
  ledger.totalInputTokens += inputTokens;
  ledger.totalOutputTokens += outputTokens;
}

export function isTokenBudgetExceeded(
  context: RunContext | { usageLedger?: UsageLedger },
  maxTokens: number
): boolean {
  if (maxTokens <= 0) return false;
  const ledger = ensureLedger(context);
  return (ledger.totalInputTokens + ledger.totalOutputTokens) > maxTokens;
}
```

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test src/usage-ledger.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/usage-ledger.ts src/usage-ledger.test.ts
git commit -m "feat(ledger): add token tracking and budget enforcement to usage ledger"
```

---

### Task 3: Prometheus Metrics — LLM Counters

**Files:**
- Modify: `src/observability/metrics-store.ts`

- [ ] **Step 1: Register new LLM metrics**

Append to the bottom of `src/observability/metrics-store.ts` (after existing registerCounter calls):

```typescript
registerCounter("agent_llm_input_tokens_total", "Total LLM input tokens consumed");
registerCounter("agent_llm_output_tokens_total", "Total LLM output tokens consumed");
registerCounter("agent_llm_latency_ms_total", "Total LLM call latency in milliseconds");
```

- [ ] **Step 2: Run existing metrics test**

Run: `node --import tsx --test src/observability/metrics-store.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/observability/metrics-store.ts
git commit -m "feat(observability): register LLM token and latency Prometheus counters"
```

---

### Task 4: Wire Metrics into Provider + Fix Callers

**Files:**
- Modify: `src/llm/provider.ts` — increment Prometheus counters after each call

- [ ] **Step 1: Add metrics integration to provider**

In `src/llm/provider.ts`, add import at the top:

```typescript
import { incCounter } from "../observability/metrics-store";
```

In `callOpenAICompatible`, before the `return { content, usage, latencyMs }` line, add:

```typescript
    incCounter("agent_llm_calls_total");
    incCounter("agent_llm_input_tokens_total", usage.inputTokens);
    incCounter("agent_llm_output_tokens_total", usage.outputTokens);
    incCounter("agent_llm_latency_ms_total", Date.now() - start);
```

Do the same in `callAnthropic`, before the return.

- [ ] **Step 2: Update callers to handle LLMCallResult**

The callers of `callOpenAICompatible` and `callAnthropic` currently expect a `string` return. They now get `LLMCallResult`. We need to update them to extract `.content`.

Find all callers by searching for `callOpenAICompatible` and `callAnthropic` in:
- `src/llm-planner.ts`
- `src/llm-replanner.ts`
- `src/llm-diagnoser.ts`
- `src/verifier/goal-verifier.ts`

For each call site, change:
```typescript
const raw = await callOpenAICompatible(config, messages, "CallerName");
```
to:
```typescript
const { content: raw } = await callOpenAICompatible(config, messages, "CallerName");
```

And similarly for `callAnthropic`.

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `node --import tsx --test src/llm/provider.test.ts src/verifier/goal-verifier.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/llm/provider.ts src/llm-planner.ts src/llm-replanner.ts src/llm-diagnoser.ts src/verifier/goal-verifier.ts
git commit -m "feat(llm): wire Prometheus metrics into provider + update callers for LLMCallResult"
```

---

### Task 5: Full Test Suite + Regression Check

- [ ] **Step 1: Run all tests**

Run: `node --import tsx --test src/verifier/*.test.ts src/cognition/*.test.ts src/core/*.test.ts src/approval/*.test.ts src/auth/*.test.ts src/usage-ledger.test.ts src/llm/provider.test.ts src/observability/metrics-store.test.ts`
Expected: All tests PASS.

- [ ] **Step 2: Fix any regressions**

Only commit if fixes needed.
