import { test } from "node:test";
import assert from "node:assert/strict";
import { getDb, closeDb } from "./client";

test("getDb: creates and returns db instance", () => {
  const db = getDb();
  assert.ok(db);
  const row = db.prepare("SELECT 1 AS val").get() as { val: number };
  assert.equal(row.val, 1);
});

test("getDb: returns same instance on second call", () => {
  const db1 = getDb();
  const db2 = getDb();
  assert.equal(db1, db2);
});

test("getDb: runs table exists", () => {
  const db = getDb();
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get() as { name: string } | undefined;
  assert.equal(row?.name, "runs");
  closeDb();
});
