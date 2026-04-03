# Phase 3: LLM Cost Control + Observability

## Problem

The project has 4 LLM call points (planner, replanner, diagnoser, verifier) but `usage-ledger.ts` only counts invocations — no token tracking, no cost visibility, no budget enforcement. This blocks production deployment.

## Scope

### A. Token Tracking in LLM Provider

**Files:** `src/llm/provider.ts`, `src/types.ts`

Change `callOpenAICompatible` and `callAnthropic` to return `{ content: string; usage: { inputTokens: number; outputTokens: number } }` instead of raw string. Parse token counts from API responses:
- OpenAI: `response.usage.prompt_tokens` / `completion_tokens`
- Anthropic: `response.usage.input_tokens` / `output_tokens`

Add `LLMCallResult` interface to provider.ts.

### B. Usage Ledger Token Accumulation

**Files:** `src/usage-ledger.ts`, `src/types.ts`

Add `totalInputTokens`, `totalOutputTokens` fields to `UsageLedger`. Add `recordLLMTokenUsage(context, inputTokens, outputTokens)` function. `finalizeUsageLedger` computes totals.

### C. Budget Enforcement

**Files:** `src/usage-ledger.ts`

Add `isTokenBudgetExceeded(context, maxTokens)` function. Callers can check before making LLM calls. No automatic enforcement — callers decide what to do (fallback to rules).

### D. Prometheus Metrics

**Files:** `src/observability/metrics-store.ts`

Register 3 new counters: `agent_llm_input_tokens_total`, `agent_llm_output_tokens_total`, `agent_llm_latency_ms_total`. Increment them in the LLM provider after each call.

### E. Tests

Unit tests for token tracking, ledger accumulation, budget check, and metrics.

## Out of Scope

- Caching (knowledge store templates already serve this purpose)
- Dollar cost estimation (too model-dependent)
- Modifying planner/replanner/diagnoser call sites (they already use the provider)
