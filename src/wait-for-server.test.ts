import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { waitForServer } from "./wait-for-server";

test("waitForServer resolves when server becomes available", async () => {
  const server = createServer((_, response) => {
    response.statusCode = 200;
    response.end("ok");
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to obtain test server address.");
  }

  await waitForServer(`http://127.0.0.1:${address.port}`, { timeoutMs: 2000, intervalMs: 100 });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("waitForServer times out for unavailable server", async () => {
  await assert.rejects(
    () => waitForServer("http://127.0.0.1:65500", { timeoutMs: 300, intervalMs: 100 }),
    /Server did not become available/
  );
});
