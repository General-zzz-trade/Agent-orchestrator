import { Logger } from "../logger";
import {
  clickElement,
  createBrowserSession,
  openPage,
  takeScreenshot,
  waitForDuration
} from "../browser";
import { AgentTask, RunArtifact, RunContext } from "../types";

export interface TaskExecutionOutput {
  summary: string;
  artifacts?: RunArtifact[];
}

export async function handleBrowserTask(
  context: RunContext,
  task: AgentTask,
  logger: Logger
): Promise<TaskExecutionOutput> {
  switch (task.type) {
    case "open_page": {
      const url = readString(task, "url");
      const session = await getOrCreateBrowserSession(context);
      logger.info(`Opening page: ${url}`);
      const title = await openPage(session, url);
      return {
        summary: `Opened page: ${url} (${title})`
      };
    }

    case "click": {
      const selector = readString(task, "selector");
      const session = requireBrowserSession(context, task.type);
      logger.info(`Clicking: ${selector}`);
      await clickElement(session, selector);
      return {
        summary: `Clicked: ${selector}`
      };
    }

    case "wait": {
      const durationMs = readNumber(task, "durationMs", 1000);
      logger.info(`Waiting: ${durationMs}ms`);
      await waitForDuration(context.browserSession, durationMs);
      return {
        summary: `Waited: ${durationMs}ms`
      };
    }

    case "screenshot": {
      const outputPath = readString(task, "outputPath", "artifacts/screenshot.png");
      const session = requireBrowserSession(context, task.type);
      logger.info(`Saving screenshot: ${outputPath}`);
      await takeScreenshot(session, outputPath);
      return {
        summary: `Screenshot: ${outputPath}`,
        artifacts: [
          {
            type: "screenshot",
            path: outputPath,
            description: `Screenshot captured for ${task.id}`
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported browser task: ${task.type}`);
  }
}

async function getOrCreateBrowserSession(context: RunContext) {
  if (!context.browserSession) {
    context.browserSession = await createBrowserSession();
  }

  return context.browserSession;
}

function requireBrowserSession(context: RunContext, taskType: AgentTask["type"]) {
  if (!context.browserSession) {
    throw new Error(`${taskType} requires an open browser page. Add an open_page task first.`);
  }

  return context.browserSession;
}

function readString(task: AgentTask, key: string, fallback?: string): string {
  const value = task.payload[key];
  if (typeof value === "string") {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${task.type} task requires payload.${key}.`);
}

function readNumber(task: AgentTask, key: string, fallback?: number): number {
  const value = task.payload[key];
  if (typeof value === "number") {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${task.type} task requires payload.${key}.`);
}
