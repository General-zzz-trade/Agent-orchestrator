# Enterprise Phase 1: HTTP API + SQLite Database

> **For agentic workers:** Steps use checkbox syntax for tracking.

**Goal:** Replace filesystem JSON storage with SQLite and expose all agent functionality via a Fastify REST API, while keeping CLI working.

**Architecture:** Add `src/db/` (SQLite via better-sqlite3), `src/api/` (Fastify HTTP server). Existing `runGoal()` stays intact — API and CLI both call it. memory.ts gets a DB-backed replacement.

**Tech Stack:** Fastify 5, better-sqlite3, @fastify/cors, TypeScript

---

### Task 1: Install dependencies
- [x] Install packages
- [x] Commit

### Task 2: Database schema + client
- [ ] src/db/schema.ts
- [ ] src/db/client.ts
- [ ] src/db/client.test.ts

### Task 3: DB-backed run repository
- [ ] src/db/runs-repo.ts
- [ ] src/db/runs-repo.test.ts

### Task 4: Wire DB into memory.ts
- [ ] Rewrite src/memory.ts

### Task 5: Fastify API server
- [ ] src/api/routes/runs.ts
- [ ] src/api/server.ts
- [ ] package.json api script

### Task 6: API integration test
- [ ] src/api/server.test.ts

### Task 7: Async run submission
- [ ] src/api/run-store.ts
- [ ] Update routes for 202 non-blocking
