import { TaskBlueprint } from "./task-id";

export function createRegexPlan(goal: string): TaskBlueprint[] {
  const trimmedGoal = goal.trim();

  if (!trimmedGoal) {
    return [];
  }

  const normalizedGoal = trimmedGoal.replace(/\bthen\b/gi, " and ");
  const parts = normalizedGoal
    .split(/\s+\band\b\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const blueprints: TaskBlueprint[] = [];

  for (const part of parts) {
    const task = parseBlueprint(part);
    if (task) {
      blueprints.push(task);
    }
  }

  if (blueprints.length === 0) {
    const fallbackUrl = extractUrl(trimmedGoal);
    if (fallbackUrl) {
      blueprints.push({ type: "open_page", payload: { url: fallbackUrl } });
    }
  }

  const hasStartApp = blueprints.some((task) => task.type === "start_app");
  const hasStopApp = blueprints.some((task) => task.type === "stop_app");

  if (hasStartApp && !hasStopApp) {
    blueprints.push({ type: "stop_app", payload: {} });
  }

  return blueprints;
}

function parseBlueprint(part: string): TaskBlueprint | null {
  const startCommand = extractQuotedValue(part, /(?:start app|run app|launch app|start server|run server)\s+"([^"]+)"/i);
  if (startCommand) {
    return { type: "start_app", payload: { command: startCommand } };
  }

  const serverUrl = extractQuotedValue(part, /wait for server\s+"([^"]+)"/i) ?? extractUrl(part);
  if (/wait for server/i.test(part) && serverUrl) {
    return {
      type: "wait_for_server",
      payload: {
        url: serverUrl,
        timeoutMs: extractTimeout(part) ?? 30000
      }
    };
  }

  const pageUrl =
    extractQuotedValue(part, /open page\s+"([^"]+)"/i) ??
    extractQuotedValue(part, /open\s+"([^"]+)"/i) ??
    extractUrl(part);
  if (pageUrl && /\bopen\b/i.test(part)) {
    return { type: "open_page", payload: { url: pageUrl } };
  }

  const clickSelector = extractQuotedValue(part, /click\s+"([^"]+)"/i) ?? extractUnquotedSelector(part);
  if (clickSelector && /\bclick\b/i.test(part)) {
    return { type: "click", payload: { selector: clickSelector } };
  }

  const waitDuration = extractWaitDuration(part);
  if (waitDuration !== null && /\bwait\b/i.test(part) && !/\bwait for server\b/i.test(part)) {
    return { type: "wait", payload: { durationMs: waitDuration } };
  }

  const assertText = extractQuotedValue(part, /assert text\s+"([^"]+)"/i) ?? extractQuotedValue(part, /verify text\s+"([^"]+)"/i);
  if (assertText) {
    return {
      type: "assert_text",
      payload: {
        text: assertText,
        timeoutMs: extractTimeout(part) ?? 5000
      }
    };
  }

  if (/\bscreenshot\b|\bcapture\b/i.test(part)) {
    return {
      type: "screenshot",
      payload: {
        outputPath: extractScreenshotPath(part) ?? "artifacts/screenshot.png"
      }
    };
  }

  if (/\bstop app\b|\bstop server\b|\bclose app\b|\bshutdown app\b/i.test(part)) {
    return { type: "stop_app", payload: {} };
  }

  return null;
}

function extractUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s"]+/i);
  return match?.[0];
}

function extractQuotedValue(value: string, pattern: RegExp): string | undefined {
  const match = value.match(pattern);
  return match?.[1];
}

function extractUnquotedSelector(value: string): string | undefined {
  const match = value.match(/click\s+(#[^\s]+|\.[^\s]+|text=[^\s]+|data-testid=[^\s]+)/i);
  return match?.[1];
}

function extractWaitDuration(value: string): number | null {
  const secondsMatch = value.match(/wait\s+(\d+)\s*(second|seconds|sec|s)\b/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]) * 1000;
  }

  const millisecondsMatch = value.match(/wait\s+(\d+)\s*(millisecond|milliseconds|ms)\b/i);
  if (millisecondsMatch) {
    return Number(millisecondsMatch[1]);
  }

  return null;
}

function extractTimeout(value: string): number | undefined {
  const secondsMatch = value.match(/timeout\s+(\d+)\s*(second|seconds|sec|s)\b/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]) * 1000;
  }

  const millisecondsMatch = value.match(/timeout\s+(\d+)\s*(millisecond|milliseconds|ms)\b/i);
  if (millisecondsMatch) {
    return Number(millisecondsMatch[1]);
  }

  return undefined;
}

function extractScreenshotPath(value: string): string | undefined {
  const match = value.match(/screenshot\s+(?:to|as)\s+([^\s]+)/i);
  return match?.[1];
}
