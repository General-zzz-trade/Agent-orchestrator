/**
 * Session Store — SQLite-backed browser session persistence.
 * Stores cookies and localStorage so browser sessions survive across runs.
 */

import { getDb } from "../db/client";
import { randomUUID } from "node:crypto";

export interface StoredSession {
  id: string;
  tenantId: string;
  domain: string;
  cookies: string;
  localStorage?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    domain TEXT NOT NULL,
    cookies TEXT NOT NULL,
    local_storage TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_tenant_domain ON sessions(tenant_id, domain);
  CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
`;

export function initSessionTable(): void {
  getDb().exec(CREATE_SESSIONS_TABLE);
}

export function saveSession(
  tenantId: string,
  domain: string,
  cookies: object[],
  localStorage?: Record<string, string>
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const cookiesJson = JSON.stringify(cookies);
  const localStorageJson = localStorage ? JSON.stringify(localStorage) : null;
  const id = randomUUID();

  db.prepare(`
    INSERT INTO sessions (id, tenant_id, domain, cookies, local_storage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, domain) DO UPDATE SET
      cookies = excluded.cookies,
      local_storage = COALESCE(excluded.local_storage, sessions.local_storage),
      updated_at = excluded.updated_at
  `).run(id, tenantId, domain, cookiesJson, localStorageJson, now, now);
}

export function loadSession(tenantId: string, domain: string): StoredSession | undefined {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, tenant_id, domain, cookies, local_storage, created_at, updated_at, expires_at
    FROM sessions
    WHERE tenant_id = ? AND domain = ?
  `).get(tenantId, domain) as {
    id: string;
    tenant_id: string;
    domain: string;
    cookies: string;
    local_storage: string | null;
    created_at: string;
    updated_at: string;
    expires_at: string | null;
  } | undefined;

  if (!row) return undefined;

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    deleteSession(tenantId, domain);
    return undefined;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    domain: row.domain,
    cookies: row.cookies,
    localStorage: row.local_storage ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

export function deleteSession(tenantId: string, domain: string): void {
  getDb().prepare("DELETE FROM sessions WHERE tenant_id = ? AND domain = ?").run(tenantId, domain);
}

export function listSessions(tenantId: string): Array<{ domain: string; updatedAt: string }> {
  const rows = getDb().prepare(`
    SELECT domain, updated_at FROM sessions WHERE tenant_id = ? ORDER BY updated_at DESC
  `).all(tenantId) as Array<{ domain: string; updated_at: string }>;

  return rows.map(r => ({ domain: r.domain, updatedAt: r.updated_at }));
}
