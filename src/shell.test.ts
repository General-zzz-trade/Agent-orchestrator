import test from "node:test";
import assert from "node:assert/strict";
import { startApp, stopApp } from "./shell";

test("startApp launches a process and stopApp stops it", async () => {
  const command = `"${process.execPath}" -e "setInterval(() => {}, 1000)"`;
  const handle = startApp(command);

  assert.ok(handle.process.pid);

  await stopApp(handle);

  assertProcessStopped(handle.process.pid);
});

test("stopApp can be called twice without double cleanup issues", async () => {
  const command = `"${process.execPath}" -e "setInterval(() => {}, 1000)"`;
  const handle = startApp(command);

  await stopApp(handle);
  await stopApp(handle);

  assertProcessStopped(handle.process.pid);
});

function assertProcessStopped(pid?: number): void {
  assert.ok(pid);
  assert.throws(() => process.kill(pid, 0));
}
