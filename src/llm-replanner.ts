import { FailurePattern } from "./memory";
import { RecentRunSummary } from "./llm-diagnoser";
import { AgentAction, AgentTask } from "./types";
import { TaskBlueprint } from "./planner/task-id";

export interface LLMReplannerInput {
  goal: string;
  currentTask: AgentTask;
  currentError: string;
  recentRunsSummary: RecentRunSummary[];
  failurePatterns: FailurePattern[];
  currentTaskListSnapshot: AgentTask[];
}

export interface LLMReplannerConfig {
  provider: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMReplanner {
  readonly config: LLMReplannerConfig;
  replan(input: LLMReplannerInput): Promise<TaskBlueprint[]>;
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

export function createReplannerFromEnv(): LLMReplanner | undefined {
  const provider = process.env.LLM_REPLANNER_PROVIDER?.trim();
  if (!provider) {
    return undefined;
  }

  const config: LLMReplannerConfig = {
    provider,
    model: process.env.LLM_REPLANNER_MODEL?.trim() || "gpt-4.1-mini",
    timeoutMs: Number(process.env.LLM_REPLANNER_TIMEOUT_MS ?? 8000),
    maxTokens: Number(process.env.LLM_REPLANNER_MAX_TOKENS ?? 400),
    temperature: Number(process.env.LLM_REPLANNER_TEMPERATURE ?? 0.1),
    apiKey: process.env.LLM_REPLANNER_API_KEY?.trim(),
    baseUrl: process.env.LLM_REPLANNER_BASE_URL?.trim()
  };

  if (provider === "mock") {
    return createMockReplanner(config);
  }

  if (provider === "openai-compatible") {
    if (!config.apiKey || !config.baseUrl) {
      return undefined;
    }

    return createOpenAICompatibleReplanner(config);
  }

  return undefined;
}

export function validateLLMReplannerOutput(tasks: TaskBlueprint[]): boolean {
  return tasks.every((task) => ALLOWED_TASK_TYPES.has(task.type));
}

function createMockReplanner(config: LLMReplannerConfig): LLMReplanner {
  return {
    config,
    async replan(input: LLMReplannerInput): Promise<TaskBlueprint[]> {
      const goal = input.goal;

      if (input.currentTask.type === "click" && /#wrong-button|not found|timeout/i.test(`${input.currentTask.payload.selector ?? ""} ${input.currentError}`)) {
        if (/delayed/i.test(goal)) {
          return [
            { type: "wait", payload: { durationMs: 1000 } },
            { type: "click", payload: { selector: "#delayed-login-button" } }
          ];
        }

        if (/login|dashboard/i.test(goal)) {
          return [
            { type: "wait", payload: { durationMs: 1000 } },
            { type: "click", payload: { selector: "#login-button" } }
          ];
        }
      }

      if (input.currentTask.type === "assert_text" && /dashboard/i.test(goal) && /timeout|visible/i.test(input.currentError)) {
        return [
          { type: "wait", payload: { durationMs: 1500 } },
          { type: "assert_text", payload: { text: "Dashboard", timeoutMs: 2000 } }
        ];
      }

      if (input.currentTask.type === "wait_for_server" && /did not become available|timeout/i.test(input.currentError)) {
        return [
          {
            type: "wait_for_server",
            payload: {
              url: String(input.currentTask.payload.url ?? ""),
              timeoutMs: Math.max(Number(input.currentTask.payload.timeoutMs ?? 30000) + 5000, 35000)
            }
          }
        ];
      }

      return [];
    }
  };
}

function createOpenAICompatibleReplanner(config: LLMReplannerConfig): LLMReplanner {
  return {
    config,
    async replan(input: LLMReplannerInput): Promise<TaskBlueprint[]> {
      const responseText = await postReplanRequest(config, input);
      const parsed = safeJsonParse(responseText);

      if (!Array.isArray(parsed)) {
        throw new Error("LLM replanner response was not a JSON task array.");
      }

      return parsed
        .map((item) => normalizeTaskBlueprint(item))
        .filter((item): item is TaskBlueprint => item !== undefined);
    }
  };
}

async function postReplanRequest(config: LLMReplannerConfig, input: LLMReplannerInput): Promise<string> {
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
              "You are a constrained UI test replanner. Return JSON only. Output {\"tasks\":[...]} where each task uses only allowed types: start_app, wait_for_server, open_page, click, wait, assert_text, screenshot, stop_app. Produce only small remedial steps."
          },
          {
            role: "user",
            content: JSON.stringify({
              goal: input.goal,
              currentTask: input.currentTask,
              currentError: input.currentError,
              recentRunsSummary: input.recentRunsSummary,
              failurePatterns: input.failurePatterns,
              currentTaskListSnapshot: input.currentTaskListSnapshot
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`LLM replanner HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("LLM replanner returned empty content.");
    }

    return unwrapTasksPayload(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`LLM replanner timed out after ${config.timeoutMs}ms.`);
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
