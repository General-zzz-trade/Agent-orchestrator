/**
 * Hard / adversarial benchmark tasks that force Level-4 cognitive modules to activate.
 *
 * These tasks target: selector recovery, session hypothesis, state_not_ready hypothesis,
 * multi-step planning, error recovery, visual/text-based clicking, and LLM planner fallback.
 */

import type { BenchmarkTask } from "./tasks";

export function getHardBenchmarkTasks(command: string, url: string): BenchmarkTask[] {
  return [
    // H01 — Selector drift: IDs change each load, must fall back to data-testid or visual
    {
      id: "H01",
      name: "Navigate with drifted selectors",
      difficulty: "expert",
      category: "recovery",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/selector-drift" and click "[data-testid=action-button]" and assert text "Action Completed Successfully" and stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" &&
            t.status === "done" &&
            /Action Completed/i.test(t.payload?.text ?? ""),
        ),
      description:
        "Button IDs randomize each load — forces selector recovery or visual fallback",
    },

    // H02 — Session expiry: must detect redirect-to-login and re-authenticate
    {
      id: "H02",
      name: "Complete action with session expiry",
      difficulty: "expert",
      category: "recovery",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/session-expire" and type "#session-user" "testuser" and click "#session-login-btn" and assert text "Authenticated Dashboard" and open page "${url}/chaos/session-expire" and open page "${url}/chaos/session-expire" and open page "${url}/chaos/session-expire" and assert text "Authenticated Dashboard" and stop app`,
      verify: (r) =>
        r.replanCount >= 1 ||
        r.tasks?.some(
          (t: any) => t.type === "assert_text" && t.status === "done",
        ) ||
        r.result?.success === true,
      description:
        "Session expires after 3 loads — forces session_not_established hypothesis and re-login",
    },

    // H03 — Slow render: content appears after 3s, no explicit wait in goal
    {
      id: "H03",
      name: "Assert text on slow-render page",
      difficulty: "expert",
      category: "dynamic",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/slow-render" and assert text "Slowly Rendered Content" and stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" &&
            t.status === "done" &&
            /Slowly Rendered/i.test(t.payload?.text ?? ""),
        ),
      description:
        "Content renders after 3s delay with no explicit wait — forces state_not_ready hypothesis and retry",
    },

    // H04 — Multi-step wizard: 3-page form requiring sequential completion
    {
      id: "H04",
      name: "Complete 3-step wizard form",
      difficulty: "expert",
      category: "multi-step",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/multi-step-form?step=1" and type "#wizard-name" "Jane Doe" and type "#wizard-email" "jane@example.com" and click "#wizard-next-1" and select "#wizard-pref" "sms" and click "#wizard-next-2" and assert text "Registration Complete" and stop app`,
      verify: (r) => r.result?.success === true,
      description:
        "3-page wizard form requiring sequential page navigation and form fills",
    },

    // H05 — Error recovery: first visit 500s, second succeeds
    {
      id: "H05",
      name: "Navigate to error page and recover",
      difficulty: "expert",
      category: "recovery",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/error-recovery" and assert text "Recovered Successfully" and stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.replanCount >= 1 ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" &&
            t.status === "done" &&
            /Recovered/i.test(t.payload?.text ?? ""),
        ),
      description:
        "First visit returns 500, second works — forces error recovery hypothesis and retry",
    },

    // H06 — Dynamic navigation: link text changes each load, href is stable
    {
      id: "H06",
      name: "Click dynamic navigation link",
      difficulty: "expert",
      category: "dynamic",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/dynamic-nav" and click "[data-testid=nav-dashboard]" and assert text "Dashboard" and stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" &&
            t.status === "done" &&
            /Dashboard/i.test(t.payload?.text ?? ""),
        ),
      description:
        "Nav link text randomizes each load — forces visual/text-based or attribute-based click",
    },

    // H07 — Natural language goal: no DSL, forces LLM planner
    {
      id: "H07",
      name: "NL goal: register a new user",
      difficulty: "expert",
      category: "multi-step",
      goal: `start app "${command}" and wait for server "${url}" then register a new user named "Alice Wonder" with email "alice@wonder.com" and password "secure456" on the registration page, then confirm the registration and verify it completed successfully, then stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.plannerDecisionTrace?.chosenPlanner === "llm" ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" &&
            t.status === "done" &&
            /Registration Complete/i.test(t.payload?.text ?? ""),
        ),
      description:
        "Free-form natural language goal — no DSL commands, forces LLM planner activation",
    },

    // H08 — Natural language goal: search
    {
      id: "H08",
      name: "NL goal: find and search",
      difficulty: "expert",
      category: "search",
      goal: `start app "${command}" and wait for server "${url}" then navigate to the search page and search for "Alpha" and verify that search results appear, then stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.plannerDecisionTrace?.chosenPlanner === "llm" ||
        r.tasks?.some(
          (t: any) =>
            t.type === "assert_text" && t.status === "done",
        ),
      description:
        "Natural language search goal — forces LLM planner to infer navigation + form interaction",
    },

    // H09 — Natural language goal: login + screenshot
    {
      id: "H09",
      name: "NL goal: login and screenshot dashboard",
      difficulty: "expert",
      category: "multi-step",
      goal: `start app "${command}" and wait for server "${url}" then log in with username "admin" and password "pass" and take a screenshot of the dashboard, then stop app`,
      verify: (r) =>
        r.result?.success === true ||
        r.plannerDecisionTrace?.chosenPlanner === "llm" ||
        r.tasks?.some((t: any) => t.type === "screenshot" && t.status === "done"),
      description:
        "Natural language login + screenshot — forces LLM planner for multi-step auth flow",
    },

    // H10 — Combined: selector drift + session expire (hardest)
    {
      id: "H10",
      name: "Selector drift + session expire combined",
      difficulty: "expert",
      category: "recovery",
      goal: `start app "${command}" and wait for server "${url}" and open page "${url}/chaos/session-expire" and type "#session-user" "admin" and click "#session-login-btn" and assert text "Authenticated Dashboard" and open page "${url}/chaos/session-expire" and open page "${url}/chaos/session-expire" and open page "${url}/chaos/session-expire" and open page "${url}/chaos/selector-drift" and click "[data-testid=action-button]" and assert text "Action Completed Successfully" and stop app`,
      verify: (r) =>
        r.result?.success === true ||
        (r.replanCount >= 1 &&
          r.tasks?.some(
            (t: any) =>
              t.type === "assert_text" &&
              t.status === "done" &&
              /Action Completed/i.test(t.payload?.text ?? ""),
          )),
      description:
        "Session expires mid-flow then selector drifts — forces multiple recovery hypotheses simultaneously",
    },
  ];
}
