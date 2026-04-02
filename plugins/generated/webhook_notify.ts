/**
 * Auto-generated plugin: webhook_notify
 * Description: Send webhook notification
 * Generated: 2026-04-01T15:35:20.533Z
 */
import type { AgentPlugin, PluginActionHandler, ActionOutput } from "../../src/plugins/types";
import type { RunContext, AgentTask } from "../../src/types";

const handler: PluginActionHandler = {
  type: "webhook_notify",
  description: "Send webhook notification",
  payloadSchema: {
  "url": "string",
  "payload": "string"
},
  async execute(context: RunContext, task: AgentTask): Promise<ActionOutput> {
    const payload = task.payload;
  if (!payload.url) throw new Error("webhook_notify: 'url' is required");
  const response = await fetch(String(payload.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`webhook_notify failed: ${response.status}`);
  return { summary: `webhook_notify succeeded (${response.status})` };
  }
};

const plugin: AgentPlugin = {
  name: "auto-webhook_notify",
  version: "1.0.0",
  actions: [handler]
};

export default plugin;
