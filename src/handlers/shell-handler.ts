import { Logger } from "../logger";
import { startApp, stopApp } from "../shell";
import { AgentTask, RunContext } from "../types";
import { waitForServer } from "../wait-for-server";
import { TaskExecutionOutput } from "./browser-handler";

export async function handleShellTask(
  context: RunContext,
  task: AgentTask,
  logger: Logger
): Promise<TaskExecutionOutput> {
  switch (task.type) {
    case "start_app": {
      const command = readString(task, "command");
      logger.info(`Starting app: ${command}`);
      context.appProcess = startApp(command);
      return {
        summary: `Started app: ${command}`,
        stateHints: [`app_started:${command}`]
      };
    }

    case "wait_for_server": {
      const url = readString(task, "url");
      const timeoutMs = readNumber(task, "timeoutMs", 30000);
      logger.info(`Waiting for server: ${url} (${timeoutMs}ms timeout)`);
      await waitForServer(url, { timeoutMs });
      return {
        summary: `Server available: ${url}`,
        stateHints: [`server_ready:${url}`]
      };
    }

    case "stop_app": {
      logger.info("Stopping app process.");
      await stopApp(context.appProcess);
      context.appProcess = undefined;
      return {
        summary: "Stopped app",
        stateHints: ["app_stopped:true"]
      };
    }

    default:
      throw new Error(`Unsupported shell task: ${task.type}`);
  }
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
