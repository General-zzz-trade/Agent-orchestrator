# AGI Architecture Research Plan

## Vision

Evolve Agent Orchestrator from a rule-driven task automation system toward a self-improving cognitive agent with world understanding, semantic memory, and autonomous goal management.

## Current Baseline

The agent has a complete cognitive loop (observe→execute→verify→hypothesize→experiment→recover→learn) but every component is rule-based:
- World state: keyword matching to guess app state
- Memory: exact-match key-value lookup
- Decisions: fixed-formula confidence scores
- Learning: pattern extraction without generalization
- Goals: user-provided, template-parsed
- Perception: 8 lines of innerText

## Research Phases

### Phase R1: Semantic Memory (Embedding Retrieval)

**Problem:** Knowledge retrieval uses SQL `LIKE` queries. Agent can't find "similar" past experiences, only exact matches.

**Approach:**
- Generate natural language episode summaries after each run
- Compute embeddings (LLM embedding API or local model)
- Store embeddings alongside episodes in SQLite
- On new run, retrieve top-K most similar past episodes by cosine similarity
- Inject retrieved episodes as context for planner and replanner

**Files:**
- Create: `src/memory/episode-store.ts` — episode summaries + embeddings
- Create: `src/memory/embedding.ts` — embedding API wrapper
- Create: `src/memory/semantic-search.ts` — cosine similarity retrieval
- Modify: `src/core/runtime.ts` — generate episode summary after run
- Modify: `src/planner/index.ts` — inject retrieved episodes into planner context

**Success Criteria:**
- Agent retrieves relevant past episodes for similar goals
- Planner produces better plans when past experience exists
- Retrieval works without exact keyword match

---

### Phase R2: Causal World Model

**Problem:** Agent doesn't understand cause and effect. It doesn't know "clicking login causes navigation to dashboard" — it just follows templates.

**Approach:**
- Extract (action, pre_state, post_state) triples from successful runs
- Build a directed graph: edges are actions, nodes are states
- Use forward search (BFS from current state to goal state) to generate plans
- Use backward search (from failed goal state) to diagnose missing preconditions

**Files:**
- Create: `src/world-model/causal-graph.ts` — graph data structure + search
- Create: `src/world-model/extractor.ts` — extract triples from run history
- Create: `src/world-model/planner-adapter.ts` — generate plans from graph search
- Modify: `src/knowledge/extractor.ts` — extract state transitions alongside existing knowledge
- Modify: `src/cognition/hypothesis-engine.ts` — use causal graph for diagnosis

**Success Criteria:**
- Graph contains learned action→state transitions
- Forward search produces valid task sequences for known domains
- Diagnosis identifies missing preconditions for failures

---

### Phase R3: Meta-Cognition (Self-Aware Confidence)

**Problem:** Confidence scores are fixed formulas. Agent doesn't know "I've never seen this domain before" or "this selector failed 5 times already".

**Approach:**
- Query knowledge store before every decision for domain familiarity
- Scale confidence by experience level (new domain → lower confidence)
- Track per-selector failure history and adjust strategy preemptively
- Detect "stuck" state (repeated failures with no progress) and escalate

**Files:**
- Create: `src/cognition/meta-cognition.ts` — experience-aware confidence adjustment
- Modify: `src/cognition/executive-controller.ts` — query meta-cognition before deciding
- Modify: `src/cognition/hypothesis-engine.ts` — adjust prior probabilities by experience

**Success Criteria:**
- Unfamiliar domains get lower initial confidence
- Known-failing selectors trigger preemptive strategy switch
- Agent requests help when truly stuck instead of looping

---

### Phase R4: Self-Improvement Loop

**Problem:** Agent records failure lessons but never generalizes. It stores "selector #btn failed on example.com" but never learns "selectors with IDs are more reliable than class selectors".

**Approach:**
- Periodic reflection job: analyze N recent runs' failure patterns
- Compute statistics: which hypothesis kinds resolve most failures? Which task types fail most?
- Auto-adjust hypothesis engine priors based on historical success rates
- Auto-generate planner rules from high-confidence patterns

**Files:**
- Create: `src/learning/reflection-loop.ts` — periodic statistical analysis
- Create: `src/learning/strategy-updater.ts` — write learned rules to knowledge store
- Modify: `src/cognition/hypothesis-engine.ts` — load priors from learned statistics
- Modify: `src/planner/prior-aware-planner.ts` — apply auto-generated rules

**Success Criteria:**
- After 20+ runs, hypothesis priors reflect actual success rates
- Planner auto-applies learned defensive patterns (e.g., "always add wait before assert on slow domains")
- Measurable improvement in success rate over time

---

### Phase R5: Causal Goal Decomposition

**Problem:** Goal decomposition is string splitting. Agent can't reason "to screenshot the dashboard, I first need to be logged in".

**Approach:**
- Use causal graph (R2) to find precondition chains for goal states
- Recursive decomposition: goal → preconditions → sub-goals → actions
- Dynamic replanning: if a precondition fails, insert the sub-goal to achieve it

**Files:**
- Modify: `src/decomposer/index.ts` — causal graph-driven decomposition
- Modify: `src/core/orchestrator.ts` — dynamic sub-goal insertion during execution
- Modify: `src/planner/replanner.ts` — precondition-aware recovery

**Success Criteria:**
- Agent autonomously determines login is needed before dashboard access
- Sub-goals are inserted dynamically when preconditions aren't met
- Works without template patterns for known causal chains

---

### Phase R6: Multi-Modal Perception

**Problem:** Agent reads 8 lines of innerText. It can't see layout, visual state, or screenshots.

**Approach:**
- Capture screenshot at each observation point
- Send to VLM (Claude Vision) for structured scene description
- Extract element positions, visual states, layout patterns
- Compare pre/post screenshots to detect what changed

**Files:**
- Modify: `src/cognition/observation-engine.ts` — add screenshot capture + VLM analysis
- Create: `src/vision/scene-analyzer.ts` — VLM-based page understanding
- Create: `src/vision/visual-diff.ts` — before/after screenshot comparison
- Modify: `src/verifier/action-verifier.ts` — visual verification option

**Success Criteria:**
- Agent can describe what a page looks like, not just what text it contains
- Visual diff detects state changes invisible to DOM text (e.g., color changes, loading spinners)
- Visual verification catches failures that text-based verification misses

---

## Execution Order

```
R1 (Semantic Memory)     ──→ R3 (Meta-Cognition)    ──→ R4 (Self-Improvement)
                                                          ↓
R2 (Causal Graph)        ──→ R5 (Goal Decomposition)     │
                                                          ↓
R6 (Multi-Modal)         ──────────────────────────→  Integration
```

R1 and R2 are independent foundations. R3 builds on R1 (needs episode retrieval for experience estimation). R4 builds on R3 (needs experience metrics to improve). R5 builds on R2 (needs causal graph for decomposition). R6 is independent but benefits from all others.

## Implementation Priority

| Phase | Effort | Impact | Dependencies | Priority |
|-------|--------|--------|-------------|----------|
| R1: Semantic Memory | Medium | High | None | **Start first** |
| R2: Causal Graph | Medium | High | None | **Start first** (parallel with R1) |
| R3: Meta-Cognition | Low | Medium | R1 | After R1 |
| R4: Self-Improvement | Medium | High | R3 | After R3 |
| R5: Goal Decomposition | High | High | R2 | After R2 |
| R6: Multi-Modal | High | Medium | None | Last |
