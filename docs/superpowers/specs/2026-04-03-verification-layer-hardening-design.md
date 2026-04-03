# Phase 1: Verification Layer Hardening + Test Coverage

## Problem

The verification layer is the weakest link in the agent's cognitive loop. Without reliable verification, the observe-execute-verify-decide cycle is effectively blind:

- `goal-verifier`: Only works for goals with quoted text; returns 0.35 confidence otherwise
- `action-verifier`: Only handles 3 of 15+ task types; defaults to `passed=true` for everything else
- `state-verifier`: Only handles 3 task types
- Core modules (`runtime`, `cognition/*`, `verifier/*`) lack unit tests, blocking safe refactoring

## Scope

Four deliverables, ordered by dependency:

### A. Goal Verifier Enhancement

**File:** `src/verifier/goal-verifier.ts`

Three-strategy cascade:

1. **Quote extraction** (existing) — extract quoted text from goal, substring match against visible text. Confidence: 0.8 pass / 0.55 fail.
2. **Task completion heuristic** (new) — compute ratio of done tasks, check final task's action+state verification results. Confidence: 0.65-0.75 based on completion ratio and verification pass rate.
3. **LLM semantic verification** (new) — send goal + visible text + task execution summaries to LLM, get boolean judgment. Only invoked when strategies 1-2 yield confidence < 0.6. Uses `LLM_VERIFIER_` env prefix, reuses `llm/provider.ts`.

**Selection logic:**
- Strategy 1 returns confidence >= 0.7 → use it
- Otherwise, run strategy 2; if combined confidence >= 0.65 → use it
- Otherwise, if LLM verifier configured → strategy 3
- Otherwise, return best result from strategies 1-2

**New signature:**
```typescript
export async function verifyGoalProgress(
  context: RunContext,
  observation: AgentObservation
): Promise<VerificationResult>
```
Signature unchanged; internal logic adds strategies.

**New env vars:** `LLM_VERIFIER_PROVIDER`, `LLM_VERIFIER_MODEL`, `LLM_VERIFIER_API_KEY`, `LLM_VERIFIER_BASE_URL`, `LLM_VERIFIER_TIMEOUT_MS` (default 5000), `LLM_VERIFIER_MAX_TOKENS` (default 200).

### B. Action Verifier Enhancement

**File:** `src/verifier/action-verifier.ts`

Add verification for all remaining task types:

| Task Type | Verification Logic | Evidence |
|-----------|-------------------|----------|
| `type` | Check observation visibleText contains typed value | expectedValue, visibleText snippet |
| `visual_type` | Same as `type` | expectedValue, visibleText snippet |
| `select` | Check observation for selected value in visibleText | expectedValue |
| `visual_click` | Same as `click` (anomaly check) | anomalyCount |
| `screenshot` | Check artifacts array for screenshot with matching taskId | artifactCount |
| `hover` | Anomaly check (same as click) | anomalyCount |
| `http_request` | Check if task has no error (task.error is undefined) | taskError |
| `wait` | Always passes (no-op verification) | — |
| `wait_for_server` | Always passes (verified by state-verifier) | — |
| `start_app` / `stop_app` | Always passes (verified by state-verifier) | — |
| `read_file` / `write_file` | Check task has no error | taskError |
| `run_code` | Check task has no error | taskError |
| `visual_assert` | Same as `assert_text` | expectedText |
| `visual_extract` | Check task completed without error | taskError |

**State verifier addition:** Add `open_page` check — verify `observation.pageUrl` matches `worldState.pageUrl` for consistency.

### C. Unit Tests

All tests use `node:test` + `node:assert/strict`. No external dependencies. Mock browser/LLM where needed.

| Test File | Module Under Test | Key Scenarios |
|-----------|------------------|---------------|
| `src/verifier/action-verifier.test.ts` | action-verifier | All task types: pass and fail cases |
| `src/verifier/goal-verifier.test.ts` | goal-verifier | Quoted text match, task completion heuristic, LLM mock, strategy cascade |
| `src/verifier/state-verifier.test.ts` | state-verifier | All task types including new open_page check |
| `src/cognition/executive-controller.test.ts` | executive-controller | All 5 decision branches: continue, reobserve, replan, retry, abort |
| `src/cognition/belief-updater.test.ts` | belief-updater | Clamp boundaries, empty experiments, multi-experiment delta accumulation, sorting |
| `src/cognition/experiment-runner.test.ts` | experiment-runner | All 5 hypothesis types with mocked browser page, inconclusive fallback |

### D. Runtime Integration Test

**File:** `src/core/runtime.test.ts`

Mock all external dependencies (planTasks, executeTask, observeEnvironment, browser, shell). Test three scenarios:

1. **Happy path** — 3 tasks all succeed, verifications pass, run completes with success
2. **Failure + recovery** — task 2 fails, replan inserts recovery tasks, run completes
3. **Budget exhaustion** — task fails repeatedly, replan budget exceeded, run terminates with correct reason

## Out of Scope

- LLM verifier prompt tuning (future iteration)
- Vision-based verification using screenshots
- Modifying executive-controller decision logic
- New handler types
- UI/API changes
