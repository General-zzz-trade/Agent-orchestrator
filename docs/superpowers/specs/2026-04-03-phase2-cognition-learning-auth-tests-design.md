# Phase 2: Cognition Layer Learning + Auth/Approval Tests

## Problem

Phase 1 gave the agent reliable verification. Now two gaps remain:

1. **Cognition layer is hardcoded** — hypothesis-engine has 5 regex patterns, executive-controller has 5 if-else branches with fixed thresholds, belief-updater treats all evidence equally. The agent can't learn new failure patterns or adapt decisions to context.

2. **Auth/approval modules have zero tests** — approval/gate.ts and auth/ are security-critical but untested.

## Scope

Two independent tracks, parallelizable:

### Track A: Cognition Layer Learning

#### A1. Hypothesis Engine Dynamic Patterns

**File:** `src/cognition/hypothesis-engine.ts`

Current: 5 hardcoded regex patterns generate hypotheses.

Change: After generating hardcoded hypotheses, query `knowledge/store.ts` for `failure_lesson` entries matching `task.type` and domain. Each matching lesson becomes a `learned_pattern` hypothesis with:
- confidence = lesson confidence from knowledge store (data-driven)
- recoveryHint = lesson.recovery field
- explanation = `Learned from prior failure: ${lesson.errorPattern}`

Add `"learned_pattern"` to `FailureHypothesisKind` type in `cognition/types.ts`.

Function signature unchanged. Domain extracted from `context.worldState?.pageUrl` or first `open_page` task.

#### A2. Executive Controller Multi-Factor Decision

**File:** `src/cognition/executive-controller.ts`

Current: Fixed thresholds (0.9, 0.7, 0.75, 0.6, 0.85).

Change: Keep the same 5-branch structure but make thresholds context-aware:
- `replan` threshold: lower when budget is high (more willingness to replan early)
- `retry_task` threshold: higher when task has error history (less willingness to retry known failures)
- `abort` confidence: scale with how many replans were already tried

Add a `computeConfidence` helper that factors in:
- `replanCount / maxReplans` (budget utilization ratio)
- `task.attempts` (retry exhaustion)
- verification confidence values

Branch selection logic stays the same (continue → reobserve → replan → retry → abort). Only confidence values become dynamic.

#### A3. Belief Updater Evidence Weighting

**File:** `src/cognition/belief-updater.ts`

Current: `nextConfidence = previousConfidence + sum(delta)` — all deltas weighted equally.

Change: Weight each delta by experiment reliability:
- Derive experiment type from `ExperimentResult.experiment` field using keyword matching
- Apply reliability multiplier: selector probe (1.0), page context (0.9), readiness probe (0.8), session marker (0.7), assertion overlap (0.6), default (0.75)
- Formula: `weightedDelta = delta * reliability`

### Track C: Auth/Approval Tests

#### C1. Approval Gate Tests

**File:** `src/approval/gate.test.ts`

Test all exported functions:
- `requiresApproval`: policy enabled/disabled, matching/non-matching task types
- `requestApproval` + `respondToApproval`: approve flow, reject flow
- `getPendingApprovals`: filter by runId
- `clearApprovals`: reject pending + cleanup
- Auto-approve timeout

Mock `publishEvent` from `streaming/event-bus` to avoid SSE side effects.

#### C2. Session Manager Tests

**File:** `src/auth/session-manager.test.ts`

Test pure functions (no Playwright dependency):
- `extractDomain`: standard URLs, www prefix, invalid URLs, localhost
- `isPasswordSelector`: various selector patterns (positive and negative)

For `restoreSession`/`captureSession`, mock `BrowserContext` and `session-store` functions.

#### C3. Session Store Tests

**File:** `src/auth/session-store.test.ts`

Uses real SQLite (in-memory via `getDb`). Tests:
- `saveSession` + `loadSession`: round-trip
- Upsert: same tenant+domain overwrites cookies
- `deleteSession`: removes entry
- `listSessions`: returns all for tenant, ordered by updatedAt
- Expiration: expired session returns undefined and is auto-deleted

## Out of Scope

- Modifying replanner.ts (it already uses knowledge priors)
- Adding new knowledge types
- Modifying API routes
- LLM cost tracking (Phase 3)
