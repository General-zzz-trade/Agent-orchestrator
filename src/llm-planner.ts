import { FailurePattern } from "./memory";
import { RecentRunSummary } from "./llm-diagnoser";
import { AgentAction } from "./types";
import { TaskBlueprint } from "./planner/task-id";

export interface LLMPlannerInput {
  goal: string;
  recentRunsSummary: RecentRunSummary[];
  failurePatterns: FailurePattern[];
}

export interface LLMPlannerConfig {
  provider: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMPlanner {
  readonly config: LLMPlannerConfig;
  plan(input: LLMPlannerInput): Promise<TaskBlueprint[]>;
}

const ALLOWED_TASK_TYPES = new Set<AgentAction>([
  "start_app",
  "wait_for_server",
  "open_page",
  "click",
  "wait",
  "assert_text",
  "screenshot",
  "stop_app"
]);

export function createPlannerFromEnv(): LLMPlanner | undefined {
  const provider = process.env.LLM_PLANNER_PROVIDER?.trim();
  if (!provider) {
    return undefined;
  }

  const config: LLMPlannerConfig = {
    provider,
    model: process.env.LLM_PLANNER_MODEL?.trim() || "gpt-4.1-mini",
    timeoutMs: Number(process.env.LLM_PLANNER_TIMEOUT_MS ?? 8000),
    maxTokens: Number(process.env.LLM_PLANNER_MAX_TOKENS ?? 600),
    temperature: Number(process.env.LLM_PLANNER_TEMPERATURE ?? 0.1),
    apiKey: process.env.LLM_PLANNER_API_KEY?.trim(),
    baseUrl: process.env.LLM_PLANNER_BASE_URL?.trim()
  };

  if (provider === "mock") {
    return createMockPlanner(config);
  }

  if (provider === "openai-compatible") {
    if (!config.apiKey || !config.baseUrl) {
      return undefined;
    }

    return createOpenAICompatiblePlanner(config);
  }

  return undefined;
}

export function validateLLMPlannerOutput(tasks: TaskBlueprint[]): boolean {
  return tasks.every((task) => ALLOWED_TASK_TYPES.has(task.type));
}

function createMockPlanner(config: LLMPlannerConfig): LLMPlanner {
  return {
    config,
    async plan(input: LLMPlannerInput): Promise<TaskBlueprint[]> {
      const goal = input.goal;
      const command =
        extractQuotedValue(goal, /(?:start app|run app|launch app|boot app)\s+"([^"]+)"/i) ??
        extractQuotedValue(goal, /using\s+"([^"]+)"/i);
      const url = extractUrl(goal);

      if (/delayed login/i.test(goal) && command && url) {
        return [
          { type: "start_app", payload: { command } },
          { type: "wait_for_server", payload: { url, timeoutMs: 30000 } },
          { type: "open_page", payload: { url } },
          { type: "click", payload: { selector: "#delayed-login-button" } },
          { type: "assert_text", payload: { text: "Dashboard", timeoutMs: 1000 } },
          { type: "screenshot", payload: { outputPath: "artifacts/llm-delayed-login.png" } },
          { type: "stop_app", payload: {} }
        ];
      }

      if (/login/i.test(goal) && command && url) {
        return [
          { type: "start_app", payload: { command } },
          { type: "wait_for_server", payload: { url, timeoutMs: 30000 } },
          { type: "open_page", payload: { url } },
          { type: "click", payload: { selector: "#login-button" } },
          { type: "assert_text", payload: { text: "Dashboard", timeoutMs: 5000 } },
          { type: "stop_app", payload: {} }
        ];
      }

      if (url && /capture|screenshot/i.test(goal)) {
        return [
          { type: "open_page", payload: { url } },
          { type: "screenshot", payload: { outputPath: "artifacts/llm-page.png" } }
        ];
      }

      return [];
    }
  };
}

function createOpenAICompatiblePlanner(config: LLMPlannerConfig): LLMPlanner {
  return {
    config,
    async plan(input: LLMPlannerInput): Promise<TaskBlueprint[]> {
      const responseText = await postPlanRequest(config, input);
      const parsed = safeJsonParse(responseText);

      if (!Array.isArray(parsed)) {
        throw new Error("LLM planner response was not a JSON task array.");
      }

      return parsed
        .map((item) => normalizeTaskBlueprint(item))
        .filter((item): item is TaskBlueprint => item !== undefined);
    }
  };
}

async function postPlanRequest(config: LLMPlannerConfig, input: LLMPlannerInput): Promise<string> {
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
        messages: [
          {
            role: "system",
            content:
              "You are a constrained UI test planner. Return JSON only. Output {\"tasks\":[...]} where each task uses only allowed types: start_app, wait_for_server, open_page, click, wait, assert_text, screenshot, stop_app. Keep payloads minimal and executable."
          },
          {
            role: "user",
            content: JSON.stringify({
              goal: input.goal,
              recentRunsSummary: input.recentRunsSummary,
              failurePatterns: input.failurePatterns
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`LLM planner HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("LLM planner returned empty content.");
    }

    return unwrapTasksPayload(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM planner timed out after ${config.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapTasksPayload(content: string): string {
  const parsed = safeJsonParse(content);
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
    return JSON.stringify((parsed as { tasks: unknown[] }).tasks);
  }

  return content;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeTaskBlueprint(value: unknown): TaskBlueprint | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    type?: unknown;
    payload?: unknown;
  };

  if (typeof candidate.type !== "string" || !ALLOWED_TASK_TYPES.has(candidate.type as AgentAction)) {
    return undefined;
  }

  if (!candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) {
    return undefined;
  }

  const payload = Object.fromEntries(
    Object.entries(candidate.payload).filter(([, item]) => {
      return typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === undefined;
    })
  );

  return {
    type: candidate.type as AgentAction,
    payload
  };
}

function extractUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s"]+/i);
  return match?.[0];
}

function extractQuotedValue(value: string, pattern: RegExp): string | undefined {
  const match = value.match(pattern);
  return match?.[1];
}
