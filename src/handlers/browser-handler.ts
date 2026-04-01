import { Logger } from "../logger";
import {
  clickElement,
  createBrowserSession,
  hoverElement,
  openPage,
  scrollElement,
  selectOption,
  takeScreenshot,
  typeIntoElement,
  waitForDuration
} from "../browser";
import { AgentTask, RunArtifact, RunContext } from "../types";
import { publishEvent } from "../streaming/event-bus";
import { startScreencast } from "../streaming/screencast";

export interface TaskExecutionOutput {
  summary: string;
  artifacts?: RunArtifact[];
}

async function captureAndPublishScreenshot(context: RunContext, taskId: string): Promise<void> {
  if (!context.browserSession?.page) return;
  try {
    const buffer = await context.browserSession.page.screenshot({ type: "jpeg", quality: 60 });
    const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    publishEvent({
      type: "screenshot",
      runId: context.runId,
      taskId,
      timestamp: new Date().toISOString(),
      screenshotDataUrl: dataUrl
    });
  } catch {
    // never block execution for screenshot failure
  }
}

export async function handleBrowserTask(
  context: RunContext,
  task: AgentTask,
  logger: Logger
): Promise<TaskExecutionOutput> {
  const result = await executeBrowserAction(context, task, logger);
  await captureAndPublishScreenshot(context, task.id);
  return result;
}

async function executeBrowserAction(
  context: RunContext,
  task: AgentTask,
  logger: Logger
): Promise<TaskExecutionOutput> {
  switch (task.type) {
    case "open_page": {
      const url = readString(task, "url");
      const isFirstPage = !context.browserSession;
      const session = await getOrCreateBrowserSession(context);
      logger.info(`Opening page: ${url}`);
      const title = await openPage(session, url);
      // Start continuous screencast on first page open (replaces per-action screenshots)
      if (isFirstPage && session.page && !context.screencastSession) {
        context.screencastSession = await startScreencast(session.page, context.runId).catch(() => undefined);
      }
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

    case "type": {
      const selector = readString(task, "selector");
      const text = readString(task, "text");
      const session = requireBrowserSession(context, task.type);
      logger.info(`Typing into: ${selector}`);
      await typeIntoElement(session, selector, text);
      return {
        summary: `Typed into: ${selector}`
      };
    }

    case "select": {
      const selector = readString(task, "selector");
      const value = readString(task, "value");
      const session = requireBrowserSession(context, task.type);
      logger.info(`Selecting "${value}" in: ${selector}`);
      await selectOption(session, selector, value);
      return {
        summary: `Selected "${value}" in: ${selector}`
      };
    }

    case "scroll": {
      const selector = task.payload.selector ? readString(task, "selector") : undefined;
      const direction = (readString(task, "direction", "down") as "up" | "down" | "left" | "right");
      const amount = readNumber(task, "amount", 300);
      const session = requireBrowserSession(context, task.type);
      logger.info(`Scrolling ${direction} ${amount}px${selector ? ` on: ${selector}` : ""}`);
      await scrollElement(session, selector, direction, amount);
      return {
        summary: `Scrolled ${direction} ${amount}px`
      };
    }

    case "hover": {
      const selector = readString(task, "selector");
      const session = requireBrowserSession(context, task.type);
      logger.info(`Hovering: ${selector}`);
      await hoverElement(session, selector);
      return {
        summary: `Hovered: ${selector}`
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
