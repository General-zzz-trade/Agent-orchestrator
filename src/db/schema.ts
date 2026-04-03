export const CREATE_API_KEYS_TABLE = `
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
  CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
`;

export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    planner_used TEXT,
    replan_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    result_success INTEGER,
    result_message TEXT,
    termination_reason TEXT,
    context_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id),
    tenant_id TEXT NOT NULL DEFAULT 'default',
    type TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT NOT NULL,
    task_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    task_id TEXT,
    timestamp TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    task_id TEXT,
    verifier TEXT NOT NULL,
    passed INTEGER NOT NULL,
    confidence REAL NOT NULL,
    rationale TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS episode_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    task_id TEXT,
    kind TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
  CREATE INDEX IF NOT EXISTS idx_runs_tenant ON runs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
  CREATE INDEX IF NOT EXISTS idx_observations_run_id ON observations(run_id);
  CREATE INDEX IF NOT EXISTS idx_observations_tenant ON observations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_verification_results_run_id ON verification_results(run_id);
  CREATE INDEX IF NOT EXISTS idx_verification_results_tenant ON verification_results(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_episode_events_run_id ON episode_events(run_id);
  CREATE INDEX IF NOT EXISTS idx_episode_events_tenant ON episode_events(tenant_id);
`;
