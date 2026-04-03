import { assertTextVisible } from "../assert";
import { Logger } from "../logger";
import { AgentTask, RunContext } from "../types";
import { TaskExecutionOutput } from "./browser-handler";

export async function handleAssertTask(
  context: RunContext,
  task: AgentTask,
  logger: Logger
): Promise<TaskExecutionOutput> {
  if (!context.browserSession) {
    throw new Error("assert_text requires an open browser page. Add an open_page task first.");
  }

  const text = readString(task, "text");
  const timeoutMs = readNumber(task, "timeoutMs", 5000);

  logger.info(`Asserting text: ${text}`);
  await assertTextVisible(context.browserSession, text, timeoutMs);

  return {
    summary: `Asserted text: ${text}`,
    stateHints: [`asserted_text:${text}`],
    observationHints: [`expected_text:${text}`]
  };
}

function readString(task: AgentTask, key: string): string {
  const value = task.payload[key];
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`${task.type} task requires payload.${key}.`);
}

function readNumber(task: AgentTask, key: string, fallback: number): number {
  const value = task.payload[key];
  return typeof value === "number" ? value : fallback;
}
