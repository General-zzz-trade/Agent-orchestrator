import { TaskBlueprint } from "./task-id";

export function matchTemplatePlan(goal: string): TaskBlueprint[] | null {
  const normalized = goal.trim();
  const parts = normalized
    .replace(/\bthen\b/gi, " and ")
    .split(/\s+\band\b\s+/i)
    .map((part) => part.trim());

  const startCommand = extractQuotedValue(normalized, /(?:start app|run app|launch app|start server|run server)\s+"([^"]+)"/i);
  const serverUrl = extractQuotedValue(normalized, /wait for server\s+"([^"]+)"/i) ?? extractUrl(normalized);
  const pageUrl =
    extractQuotedValue(normalized, /open page\s+"([^"]+)"/i) ??
    extractQuotedValue(normalized, /open\s+"([^"]+)"/i) ??
    extractUrl(normalized);
  const assertText = extractQuotedValue(normalized, /assert text\s+"([^"]+)"/i) ?? extractQuotedValue(normalized, /verify text\s+"([^"]+)"/i);
  const clickSelector = extractQuotedValue(normalized, /click\s+"([^"]+)"/i) ?? extractUnquotedSelector(normalized);
  const screenshotPath = extractScreenshotPath(normalized) ?? "artifacts/screenshot.png";
  const hasScreenshot = /\bscreenshot\b|\bcapture\b/i.test(normalized);

  const waitForServerPart = parts.find((part) => /wait for server/i.test(part));
  const assertPart = parts.find((part) => /assert text|verify text/i.test(part));

  if (startCommand && serverUrl && pageUrl && assertText && clickSelector && hasScreenshot) {
    return [
      { type: "start_app", payload: { command: startCommand } },
      { type: "wait_for_server", payload: { url: serverUrl, timeoutMs: extractTimeout(waitForServerPart) ?? 30000 } },
      { type: "open_page", payload: { url: pageUrl } },
      { type: "click", payload: { selector: clickSelector } },
      { type: "assert_text", payload: { text: assertText, timeoutMs: extractTimeout(assertPart) ?? 5000 } },
      { type: "screenshot", payload: { outputPath: screenshotPath } },
      { type: "stop_app", payload: {} }
    ];
  }

  if (startCommand && serverUrl && pageUrl && assertText && !clickSelector) {
    return [
      { type: "start_app", payload: { command: startCommand } },
      { type: "wait_for_server", payload: { url: serverUrl, timeoutMs: extractTimeout(waitForServerPart) ?? 30000 } },
      { type: "open_page", payload: { url: pageUrl } },
      { type: "assert_text", payload: { text: assertText, timeoutMs: extractTimeout(assertPart) ?? 5000 } },
      { type: "stop_app", payload: {} }
    ];
  }

  if (!startCommand && pageUrl && /\bscreenshot\b|\bcapture\b/i.test(normalized)) {
    return [
      { type: "open_page", payload: { url: pageUrl } },
      { type: "screenshot", payload: { outputPath: screenshotPath } }
    ];
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

function extractTimeout(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

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
