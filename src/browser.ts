import { Browser, BrowserContext, Page, chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  return {
    browser,
    context,
    page
  };
}

export async function openPage(session: BrowserSession, url: string): Promise<string> {
  await session.page.goto(url, { waitUntil: "domcontentloaded" });
  const title = await session.page.title();
  return title || "No title";
}

export async function clickElement(session: BrowserSession, selector: string): Promise<void> {
  await session.page.click(selector);
}

export async function typeIntoElement(session: BrowserSession, selector: string, text: string): Promise<void> {
  await session.page.click(selector);
  await session.page.fill(selector, text);
}

export async function selectOption(session: BrowserSession, selector: string, value: string): Promise<void> {
  await session.page.selectOption(selector, value);
}

export async function scrollElement(
  session: BrowserSession,
  selector: string | undefined,
  direction: "up" | "down" | "left" | "right",
  amount: number
): Promise<void> {
  const deltaX = direction === "right" ? amount : direction === "left" ? -amount : 0;
  const deltaY = direction === "down" ? amount : direction === "up" ? -amount : 0;

  if (selector) {
    await session.page.locator(selector).scrollIntoViewIfNeeded();
    await session.page.locator(selector).evaluate(
      (el, [dx, dy]) => el.scrollBy(dx as number, dy as number),
      [deltaX, deltaY]
    );
  } else {
    await session.page.evaluate(([dx, dy]) => window.scrollBy(dx as number, dy as number), [deltaX, deltaY]);
  }
}

export async function hoverElement(session: BrowserSession, selector: string): Promise<void> {
  await session.page.hover(selector);
}

export async function waitForDuration(session: BrowserSession | undefined, durationMs: number): Promise<void> {
  if (session) {
    await session.page.waitForTimeout(durationMs);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function takeScreenshot(session: BrowserSession, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await session.page.screenshot({ path: outputPath, fullPage: true });
}

export async function closeBrowserSession(session?: BrowserSession): Promise<void> {
  if (!session) {
    return;
  }

  await session.browser.close();
}
