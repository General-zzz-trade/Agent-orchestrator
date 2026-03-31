import { BrowserSession } from "./browser";

export async function assertTextVisible(
  session: BrowserSession,
  text: string,
  timeoutMs = 5000
): Promise<void> {
  const locator = session.page.getByText(text, { exact: false });
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
}
