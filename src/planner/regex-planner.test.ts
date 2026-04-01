import test from "node:test";
import assert from "node:assert/strict";
import { createRegexPlan } from "./regex-planner";

// ---------------------------------------------------------------------------
// Original actions (regression guard)
// ---------------------------------------------------------------------------

test("regex: start_app extracts quoted command", () => {
  const plan = createRegexPlan('start app "npm run dev"');
  assert.equal(plan[0]?.type, "start_app");
  assert.equal(plan[0]?.payload.command, "npm run dev");
});

test("regex: wait_for_server extracts url and default timeout", () => {
  const plan = createRegexPlan('wait for server "http://localhost:3000"');
  assert.equal(plan[0]?.type, "wait_for_server");
  assert.equal(plan[0]?.payload.url, "http://localhost:3000");
  assert.equal(plan[0]?.payload.timeoutMs, 30000);
});

test("regex: open_page extracts quoted url", () => {
  const plan = createRegexPlan('open page "http://example.com"');
  assert.equal(plan[0]?.type, "open_page");
  assert.equal(plan[0]?.payload.url, "http://example.com");
});

test("regex: click extracts quoted selector", () => {
  const plan = createRegexPlan('click "#login-button"');
  assert.equal(plan[0]?.type, "click");
  assert.equal(plan[0]?.payload.selector, "#login-button");
});

test("regex: click extracts unquoted id selector", () => {
  const plan = createRegexPlan("click #submit");
  assert.equal(plan[0]?.type, "click");
  assert.equal(plan[0]?.payload.selector, "#submit");
});

test("regex: assert_text extracts quoted text", () => {
  const plan = createRegexPlan('assert text "Dashboard"');
  assert.equal(plan[0]?.type, "assert_text");
  assert.equal(plan[0]?.payload.text, "Dashboard");
});

test("regex: screenshot with default path", () => {
  const plan = createRegexPlan("screenshot");
  assert.equal(plan[0]?.type, "screenshot");
  assert.equal(plan[0]?.payload.outputPath, "artifacts/screenshot.png");
});

test("regex: stop_app keyword", () => {
  const plan = createRegexPlan("stop app");
  assert.equal(plan[0]?.type, "stop_app");
});

test("regex: auto-appends stop_app when start_app present", () => {
  const plan = createRegexPlan('start app "npm run dev"');
  assert.ok(plan.some((t) => t.type === "stop_app"), "should auto-add stop_app");
});

// ---------------------------------------------------------------------------
// type action
// ---------------------------------------------------------------------------

test("type: quoted selector with into", () => {
  const plan = createRegexPlan('type "admin" into "#username"');
  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[0]?.payload.text, "admin");
  assert.equal(plan[0]?.payload.selector, "#username");
});

test("type: quoted selector with in", () => {
  const plan = createRegexPlan('type "hello" in "#search-box"');
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[0]?.payload.text, "hello");
  assert.equal(plan[0]?.payload.selector, "#search-box");
});

test("type: unquoted id selector with into", () => {
  const plan = createRegexPlan('type "secret" into #password');
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[0]?.payload.text, "secret");
  assert.equal(plan[0]?.payload.selector, "#password");
});

test("type: unquoted class selector with into", () => {
  const plan = createRegexPlan('type "hello" into .search-field');
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[0]?.payload.text, "hello");
  assert.equal(plan[0]?.payload.selector, ".search-field");
});

test("type: unquoted data attribute selector", () => {
  const plan = createRegexPlan('type "value" into [data-testid=input]');
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[0]?.payload.selector, "[data-testid=input]");
});

test("type: no match when selector missing", () => {
  const plan = createRegexPlan('type "text"');
  assert.equal(plan.filter((t) => t.type === "type").length, 0);
});

test("type: combined with click in multi-part goal", () => {
  const plan = createRegexPlan('type "admin" into "#username" and click "#submit"');
  assert.equal(plan[0]?.type, "type");
  assert.equal(plan[1]?.type, "click");
});

// ---------------------------------------------------------------------------
// select action
// ---------------------------------------------------------------------------

test("select: quoted selector with from", () => {
  const plan = createRegexPlan('select "manager" from "#role"');
  assert.equal(plan[0]?.type, "select");
  assert.equal(plan[0]?.payload.value, "manager");
  assert.equal(plan[0]?.payload.selector, "#role");
});

test("select: quoted selector with in", () => {
  const plan = createRegexPlan('select "blue" in "#color-picker"');
  assert.equal(plan[0]?.type, "select");
  assert.equal(plan[0]?.payload.value, "blue");
  assert.equal(plan[0]?.payload.selector, "#color-picker");
});

test("select: unquoted id selector", () => {
  const plan = createRegexPlan('select "option-a" from #dropdown');
  assert.equal(plan[0]?.type, "select");
  assert.equal(plan[0]?.payload.selector, "#dropdown");
});

test("select: unquoted class selector", () => {
  const plan = createRegexPlan('select "en" from .lang-select');
  assert.equal(plan[0]?.type, "select");
  assert.equal(plan[0]?.payload.selector, ".lang-select");
});

test("select: no match when selector missing", () => {
  const plan = createRegexPlan('select "value"');
  assert.equal(plan.filter((t) => t.type === "select").length, 0);
});

// ---------------------------------------------------------------------------
// hover action
// ---------------------------------------------------------------------------

test("hover: quoted selector", () => {
  const plan = createRegexPlan('hover "#menu"');
  assert.equal(plan[0]?.type, "hover");
  assert.equal(plan[0]?.payload.selector, "#menu");
});

test("hover: quoted selector with over", () => {
  const plan = createRegexPlan('hover over "#dropdown-trigger"');
  assert.equal(plan[0]?.type, "hover");
  assert.equal(plan[0]?.payload.selector, "#dropdown-trigger");
});

test("hover: unquoted id selector", () => {
  const plan = createRegexPlan("hover #nav-item");
  assert.equal(plan[0]?.type, "hover");
  assert.equal(plan[0]?.payload.selector, "#nav-item");
});

test("hover: unquoted class selector", () => {
  const plan = createRegexPlan("hover .tooltip-trigger");
  assert.equal(plan[0]?.type, "hover");
  assert.equal(plan[0]?.payload.selector, ".tooltip-trigger");
});

test("hover: over with unquoted selector", () => {
  const plan = createRegexPlan("hover over #account-menu");
  assert.equal(plan[0]?.type, "hover");
  assert.equal(plan[0]?.payload.selector, "#account-menu");
});

// ---------------------------------------------------------------------------
// scroll action
// ---------------------------------------------------------------------------

test("scroll: default direction is down, default amount 300", () => {
  const plan = createRegexPlan("scroll");
  assert.equal(plan[0]?.type, "scroll");
  assert.equal(plan[0]?.payload.direction, "down");
  assert.equal(plan[0]?.payload.amount, 300);
});

test("scroll: explicit down", () => {
  const plan = createRegexPlan("scroll down");
  assert.equal(plan[0]?.payload.direction, "down");
});

test("scroll: explicit up", () => {
  const plan = createRegexPlan("scroll up");
  assert.equal(plan[0]?.payload.direction, "up");
  assert.equal(plan[0]?.payload.amount, 300);
});

test("scroll: left direction", () => {
  const plan = createRegexPlan("scroll left");
  assert.equal(plan[0]?.payload.direction, "left");
});

test("scroll: right direction", () => {
  const plan = createRegexPlan("scroll right");
  assert.equal(plan[0]?.payload.direction, "right");
});

test("scroll: px amount", () => {
  const plan = createRegexPlan("scroll down 500px");
  assert.equal(plan[0]?.payload.amount, 500);
  assert.equal(plan[0]?.payload.direction, "down");
});

test("scroll: half keyword", () => {
  const plan = createRegexPlan("scroll half");
  assert.equal(plan[0]?.payload.amount, 400);
});

test("scroll: page keyword", () => {
  const plan = createRegexPlan("scroll page");
  assert.equal(plan[0]?.payload.amount, 800);
});

test("scroll: full keyword", () => {
  const plan = createRegexPlan("scroll full");
  assert.equal(plan[0]?.payload.amount, 800);
});

test("scroll: no selector added when not present", () => {
  const plan = createRegexPlan("scroll down");
  assert.equal(plan[0]?.payload.selector, undefined);
});

test("scroll: selector inside quotes", () => {
  const plan = createRegexPlan('scroll down in "#results-list"');
  assert.equal(plan[0]?.payload.selector, "#results-list");
  assert.equal(plan[0]?.payload.direction, "down");
});

// ---------------------------------------------------------------------------
// Multi-action goals (the and-splitter)
// ---------------------------------------------------------------------------

test("multi: open + click + assert_text sequence", () => {
  const plan = createRegexPlan(
    'open page "http://localhost:3000" and click "#login-button" and assert text "Dashboard"'
  );
  assert.equal(plan[0]?.type, "open_page");
  assert.equal(plan[1]?.type, "click");
  assert.equal(plan[2]?.type, "assert_text");
});

test("multi: type + click + assert_text (form flow)", () => {
  const plan = createRegexPlan(
    'open page "http://localhost:3000" and type "admin" into "#username" and type "pass" into "#password" and click "#submit" and assert text "Welcome"'
  );
  assert.equal(plan[0]?.type, "open_page");
  assert.equal(plan[1]?.type, "type");
  assert.equal(plan[1]?.payload.text, "admin");
  assert.equal(plan[2]?.type, "type");
  assert.equal(plan[2]?.payload.text, "pass");
  assert.equal(plan[3]?.type, "click");
  assert.equal(plan[4]?.type, "assert_text");
});

test("multi: then keyword works as and alias", () => {
  const plan = createRegexPlan(
    'open page "http://localhost:3000" then click "#btn"'
  );
  assert.equal(plan[0]?.type, "open_page");
  assert.equal(plan[1]?.type, "click");
});

test("multi: start + wait + open + type + click + assert + stop", () => {
  const plan = createRegexPlan(
    'start app "npm run dev" and wait for server "http://localhost:3000" and open page "http://localhost:3000" and type "user" into "#email" and click "#submit" and assert text "Done" and screenshot and stop app'
  );
  const types = plan.map((t) => t.type);
  assert.ok(types.includes("start_app"));
  assert.ok(types.includes("wait_for_server"));
  assert.ok(types.includes("open_page"));
  assert.ok(types.includes("type"));
  assert.ok(types.includes("click"));
  assert.ok(types.includes("assert_text"));
  assert.ok(types.includes("screenshot"));
  assert.ok(types.includes("stop_app"));
  // stop_app should appear only once (not duplicated by auto-append)
  assert.equal(types.filter((t) => t === "stop_app").length, 1);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("edge: empty goal returns empty plan", () => {
  assert.deepEqual(createRegexPlan(""), []);
});

test("edge: whitespace-only goal returns empty plan", () => {
  assert.deepEqual(createRegexPlan("   "), []);
});

test("edge: unrecognized text returns empty plan", () => {
  const plan = createRegexPlan("do something amazing");
  assert.equal(plan.length, 0);
});

test("edge: bare url triggers open_page fallback", () => {
  const plan = createRegexPlan("http://example.com");
  assert.equal(plan[0]?.type, "open_page");
  assert.equal(plan[0]?.payload.url, "http://example.com");
});

test("edge: case insensitive matching for type", () => {
  const plan = createRegexPlan('TYPE "hello" INTO "#field"');
  assert.equal(plan[0]?.type, "type");
});

test("edge: case insensitive matching for scroll", () => {
  const plan = createRegexPlan("SCROLL DOWN");
  assert.equal(plan[0]?.type, "scroll");
  assert.equal(plan[0]?.payload.direction, "down");
});
