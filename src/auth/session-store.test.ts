import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { saveSession, loadSession, deleteSession, listSessions, initSessionTable } from "./session-store";
import { getDb } from "../db/client";

beforeEach(() => {
  initSessionTable();
});

test("saveSession + loadSession round-trip", () => {
  const cookies = [{ name: "sid", value: "abc123", domain: "example.com", path: "/" }];
  saveSession("tenant-1", "example.com", cookies);

  const loaded = loadSession("tenant-1", "example.com");
  assert.ok(loaded);
  assert.equal(loaded!.tenantId, "tenant-1");
  assert.equal(loaded!.domain, "example.com");

  const parsedCookies = JSON.parse(loaded!.cookies);
  assert.equal(parsedCookies.length, 1);
  assert.equal(parsedCookies[0].name, "sid");
});

test("saveSession upserts on same tenant+domain", () => {
  const cookies1 = [{ name: "sid", value: "first", domain: "example.com", path: "/" }];
  const cookies2 = [{ name: "sid", value: "second", domain: "example.com", path: "/" }];

  saveSession("tenant-upsert", "example.com", cookies1);
  saveSession("tenant-upsert", "example.com", cookies2);

  const loaded = loadSession("tenant-upsert", "example.com");
  assert.ok(loaded);
  const parsedCookies = JSON.parse(loaded!.cookies);
  assert.equal(parsedCookies[0].value, "second");
});

test("loadSession returns undefined for non-existent session", () => {
  const loaded = loadSession("no-tenant", "no-domain.com");
  assert.equal(loaded, undefined);
});

test("deleteSession removes the session", () => {
  saveSession("tenant-del", "delete-me.com", [{ name: "x", value: "y", domain: "delete-me.com", path: "/" }]);
  assert.ok(loadSession("tenant-del", "delete-me.com"));

  deleteSession("tenant-del", "delete-me.com");
  assert.equal(loadSession("tenant-del", "delete-me.com"), undefined);
});

test("listSessions returns all sessions for tenant", () => {
  saveSession("tenant-list", "a.com", [{ name: "a", value: "1", domain: "a.com", path: "/" }]);
  saveSession("tenant-list", "b.com", [{ name: "b", value: "2", domain: "b.com", path: "/" }]);
  saveSession("other-tenant", "c.com", [{ name: "c", value: "3", domain: "c.com", path: "/" }]);

  const sessions = listSessions("tenant-list");
  assert.equal(sessions.length, 2);
  assert.ok(sessions.some((s) => s.domain === "a.com"));
  assert.ok(sessions.some((s) => s.domain === "b.com"));
});

test("loadSession returns undefined for expired session", () => {
  const db = getDb();
  initSessionTable();
  db.prepare(`
    INSERT INTO sessions (id, tenant_id, domain, cookies, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now', '-1 hour'))
  `).run("expired-id", "tenant-expired", "expired.com", "[]");

  const loaded = loadSession("tenant-expired", "expired.com");
  assert.equal(loaded, undefined);
});
