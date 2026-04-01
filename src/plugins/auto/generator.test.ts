import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateAndRegisterTool, listGeneratedTools } from "./generator";
import { clearPlugins, getActionHandler } from "../registry";

afterEach(() => clearPlugins());

test("generateAndRegisterTool: registers stub tool", () => {
  const result = generateAndRegisterTool({
    name: "test_stub_action",
    description: "A test stub action",
    payloadFields: [{ name: "message", type: "string", required: true }],
    implementation: "custom"
  });
  assert.equal(result.success, true);
  assert.equal(result.registered, true);
  assert.ok(getActionHandler("test_stub_action"));
});

test("generateAndRegisterTool: sanitizes action type name", () => {
  const result = generateAndRegisterTool({
    name: "My Tool! With Spaces",
    description: "test",
    payloadFields: [],
    implementation: "custom"
  });
  assert.ok(result.actionType.match(/^[a-z0-9_]+$/));
});

test("generateAndRegisterTool: generates code scaffold", () => {
  const result = generateAndRegisterTool({
    name: "webhook_notify",
    description: "Send webhook notification",
    payloadFields: [
      { name: "url", type: "string", required: true },
      { name: "payload", type: "string", required: false }
    ],
    implementation: "http"
  });
  assert.ok(result.code?.includes("webhook_notify"));
  assert.ok(result.code?.includes("url"));
});

test("generateAndRegisterTool: stub handler executes without error", async () => {
  generateAndRegisterTool({
    name: "noop_action",
    description: "Does nothing",
    payloadFields: [],
    implementation: "custom"
  });
  const handler = getActionHandler("noop_action");
  assert.ok(handler);
  const output = await handler!.execute({} as any, { id: "t1", type: "noop_action", payload: {} } as any);
  assert.ok(output.summary.includes("noop_action"));
});

test("listGeneratedTools: returns generated tool files", () => {
  generateAndRegisterTool({
    name: "list_test_tool",
    description: "tool for list test",
    payloadFields: [],
    implementation: "custom"
  });
  const tools = listGeneratedTools();
  assert.ok(tools.includes("list_test_tool"));
});
