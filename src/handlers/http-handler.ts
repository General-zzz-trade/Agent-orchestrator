import type { RunContext, AgentTask } from "../types";
import type { TaskExecutionOutput } from "./browser-handler";

export async function handleHttpTask(
  context: RunContext,
  task: AgentTask
): Promise<TaskExecutionOutput> {
  const url = String(task.payload.url ?? "");
  const method = String(task.payload.method ?? "GET").toUpperCase();
  const body = task.payload.body ? String(task.payload.body) : undefined;
  const headersRaw = task.payload.headers ? String(task.payload.headers) : "{}";
  const timeoutMs = Number(task.payload.timeoutMs ?? 15000);

  if (!url) throw new Error("http_request: url is required");

  const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
  if (!validMethods.includes(method)) {
    throw new Error(`http_request: invalid method "${method}"`);
  }

  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(headersRaw);
  } catch {
    throw new Error(`http_request: headers must be valid JSON`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      signal: controller.signal
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new Error(`http_request: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => "");
  const snippet = text.slice(0, 300);

  if (!response.ok) {
    throw new Error(`http_request: ${method} ${url} returned ${response.status}: ${snippet}`);
  }

  // Store response as artifact
  context.artifacts.push({
    type: "http_response",
    path: `http-response/${task.id}`,
    description: `${method} ${url} → ${response.status}`,
    taskId: task.id
  });

  return {
    summary: `${method} ${url} → ${response.status} (${text.length} bytes). Preview: ${snippet}`
  };
}
