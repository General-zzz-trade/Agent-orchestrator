/**
 * Shared LLM provider utilities used by planner, replanner, and diagnoser.
 * All three components speak the OpenAI-compatible chat completions API,
 * so the HTTP call, timeout handling, and JSON helpers live here once.
 */

export interface LLMProviderConfig {
  provider: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Reads a provider config from environment variables using the given prefix.
 * e.g. prefix "LLM_PLANNER" reads LLM_PLANNER_PROVIDER, LLM_PLANNER_MODEL, etc.
 */
export function readProviderConfig(
  envPrefix: string,
  defaults: { model?: string; maxTokens?: number; temperature?: number } = {}
): LLMProviderConfig {
  return {
    provider: process.env[`${envPrefix}_PROVIDER`]?.trim() ?? "",
    model: process.env[`${envPrefix}_MODEL`]?.trim() || defaults.model || "gpt-4.1-mini",
    timeoutMs: Number(process.env[`${envPrefix}_TIMEOUT_MS`] ?? 8000),
    maxTokens: Number(process.env[`${envPrefix}_MAX_TOKENS`] ?? defaults.maxTokens ?? 600),
    temperature: Number(process.env[`${envPrefix}_TEMPERATURE`] ?? defaults.temperature ?? 0.1),
    apiKey: process.env[`${envPrefix}_API_KEY`]?.trim(),
    baseUrl: process.env[`${envPrefix}_BASE_URL`]?.trim()
  };
}

/**
 * Calls an OpenAI-compatible chat completions endpoint and returns the raw
 * content string from the first choice.  Throws on HTTP errors, timeouts, or
 * empty responses.  `callerName` is used only in error messages.
 */
export async function callOpenAICompatible(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  callerName = "LLM"
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.baseUrl!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        response_format: { type: "json_object" },
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`${callerName} HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`${callerName} returned empty content.`);
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${callerName} timed out after ${config.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * If the LLM wrapped its task array inside {"tasks":[...]}, unwrap it.
 * Otherwise return the content unchanged.
 */
export function unwrapTasksPayload(content: string): string {
  const parsed = safeJsonParse(content);
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
    return JSON.stringify((parsed as { tasks: unknown[] }).tasks);
  }

  return content;
}
