# AGI Agent Vision

## Statement

The long-term vision of this project is to evolve from an engineering-grade cognitive workflow agent into a general-purpose, self-improving agent system.

The project is not there yet.

The purpose of this document is to define:

- what the current system already is
- what AGI-level agent capability would mean in this repository
- what architectural changes are required to move in that direction
- what must not be confused with real progress

## Current Reality

The current system already supports:

- rule and LLM planning
- cognition-aware execution
- world state updates
- action, state, and goal verification
- hypothesis-driven failure analysis
- low-risk recovery experiments
- rule and LLM replanning
- procedural memory extraction and reuse
- run inspection via cognition traces

That is a meaningful step beyond a pure orchestrator.

But it still remains an engineering agent focused on UI and tool workflows.

Its center of gravity is:

`reliable task execution with recovery`

not:

`general intelligence`

## What AGI-Level Means Here

For this repository, an AGI-level agent does not mean a vague marketing label.

It means an agent that can reliably do all of the following:

1. Build and maintain a world model

- understand objects, states, relationships, and transitions
- reason about why an action changed the environment
- detect when the world does not match expectations

2. Learn from experience at multiple levels

- episodic memory: what happened
- procedural memory: what worked
- semantic memory: what is generally true

3. Generate and test hypotheses

- produce multiple competing explanations for failure
- choose low-cost experiments to reduce uncertainty
- update belief before taking larger actions

4. Generalize across domains

- reuse knowledge across websites, tools, APIs, and workflows
- transfer from concrete failures to abstract lessons
- adapt when surface forms change but task structure remains similar

5. Manage goals and subgoals autonomously

- decompose long-horizon tasks
- update plans when priorities or constraints change
- ask for clarification or approval only when necessary

6. Improve its own future behavior

- update planning priors and recovery strategies
- change policy based on observed success and failure distributions
- get better over time rather than only logging history

## What Does Not Count As AGI Progress

The following can improve the system, but they do not by themselves move the project close to AGI:

- adding more planner variants
- adding more provider integrations
- adding larger prompts
- adding more failure enums
- adding more ledger counters
- adding more smoke suites without new cognitive capability

These are engineering improvements, not intelligence improvements.

They matter, but they are not the core frontier.

## Architectural North Star

The current runtime is increasingly organized around:

`goal -> observe -> execute -> verify -> recover`

The AGI-oriented north star is:

`goal -> state model -> observation -> hypothesis -> experiment -> belief update -> action -> verification -> memory extraction -> policy adaptation`

That requires five architectural pillars.

## Pillar 1: Stronger State and World Modeling

The project already maintains `worldState` and `worldStateHistory`.

To move further, the system must represent:

- entities in the environment
- relations between entities
- expectations before an action
- causal explanations after an action
- explicit uncertainty, not just status labels

The goal is to move from:

`execution state`

to:

`world model`

## Pillar 2: Layered Memory

The repository already has the beginning of procedural memory in `knowledge/`.

The next step is to cleanly separate:

- episodic memory: trace of a run
- procedural memory: what steps worked in a context
- semantic memory: abstract stable knowledge

Long-term progress depends on compressing repeated experience into reusable abstractions.

Without that compression, the system accumulates logs, not intelligence.

## Pillar 3: Hypothesis-Driven Cognition

The project now has a minimal hypothesis engine and low-risk experiments.

That must become more systematic:

- multiple candidate explanations
- explicit experiment policy
- experiment cost estimation
- belief updates that affect future strategy choice

The core principle is:

`do not recover blindly`

Instead:

`reduce uncertainty before spending expensive actions`

## Pillar 4: Policy Adaptation

Current policies decide whether to use rules or LLMs and when to fall back.

Future policy should learn from results:

- which priors improve plan quality
- which experiments reduce uncertainty fastest
- which recovery strategies work in which contexts
- when LLM use is worth the cost

An AGI-oriented agent must not only execute with policy.

It must improve policy.

## Pillar 5: Cross-Domain Generalization

Right now the system is strongest on UI and tool workflows.

To move beyond that, the internal abstractions must be domain-neutral enough to cover:

- browser tasks
- API tasks
- filesystem tasks
- code execution tasks
- mixed workflows that span all of the above

The metric is not "can it handle more providers".

The metric is:

`can it transfer cognition, memory, and verification strategy across domains`

## Concrete Phases

### Phase 1: Reliable Cognitive Runtime

Already in progress.

Focus:

- cognition loop
- world state
- verifiers
- hypothesis engine
- recovery experiments
- procedural memory

### Phase 2: Memory That Actually Learns

Focus:

- semantic memory extraction
- memory scoring and retrieval quality
- policy updates from experience
- stronger abstraction over repeated runs

### Phase 3: Stronger Decision Search

Focus:

- comparing multiple action branches
- experiment policies with cost control
- counterfactual reasoning over recovery choices
- critic models and stronger verifiers

### Phase 4: Goal Management

Focus:

- subgoal planning
- long-horizon task tracking
- interruption handling
- autonomous prioritization within constraints

### Phase 5: Cross-Domain General Agent

Focus:

- consistent cognition across browser, file, HTTP, and code execution
- portable semantic memory
- domain-agnostic recovery patterns
- policy adaptation at system scale

## Success Metrics

The wrong metric is "uses more LLM calls".

The right metrics are:

- higher task success rate
- lower unsafe-action rate
- lower blind-retry rate
- lower fallback rate
- more reuse of proven priors
- improved quality after prior-aware rewrites
- improved recovery success after experiments
- improved future outcomes from stored memory

For AGI-oriented progress, the most important metric is:

`does the agent get better at future tasks because of past experience`

## Non-Negotiable Constraints

As the system becomes more capable, the safety bar must rise with it.

The project should keep:

- approval boundaries
- secret isolation
- run auditability
- usage accounting
- constrained task schemas
- explicit verifiers
- reversible low-risk experiments before risky actions

More autonomy without stronger control is not progress.

It is failure delayed.

## Final Position

This repository should not claim AGI today.

What it can honestly claim is:

`a cognitive agent runtime with recovery, memory, and inspection primitives`

The long-term ambition is to become:

`a self-improving agent system that learns from interaction, models the world, and generalizes across tools and domains`

That ambition is valid.

The only way to get there is to keep the architecture anchored in:

- state
- memory
- verification
- hypothesis testing
- learning loops

and not confuse larger prompts or more providers with intelligence.
