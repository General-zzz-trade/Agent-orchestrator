import test from "node:test";
import assert from "node:assert/strict";
import { extractDomain, isPasswordSelector } from "./session-manager";

test("extractDomain: standard URL", () => {
  assert.equal(extractDomain("https://github.com/login"), "github.com");
});

test("extractDomain: strips www prefix", () => {
  assert.equal(extractDomain("https://www.github.com/login"), "github.com");
});

test("extractDomain: localhost with port", () => {
  assert.equal(extractDomain("http://localhost:3000/dashboard"), "localhost");
});

test("extractDomain: IP address", () => {
  assert.equal(extractDomain("http://192.168.1.1:8080/api"), "192.168.1.1");
});

test("extractDomain: invalid URL returns input", () => {
  assert.equal(extractDomain("not-a-url"), "not-a-url");
});

test("extractDomain: subdomain preserved", () => {
  assert.equal(extractDomain("https://api.github.com/v1"), "api.github.com");
});

test("isPasswordSelector: matches password in selector", () => {
  assert.equal(isPasswordSelector("#password"), true);
});

test("isPasswordSelector: matches type=password attribute", () => {
  assert.equal(isPasswordSelector('[type="password"]'), true);
});

test("isPasswordSelector: matches single-quote type=password", () => {
  assert.equal(isPasswordSelector("[type='password']"), true);
});

test("isPasswordSelector: matches passwd variant", () => {
  assert.equal(isPasswordSelector("#user-passwd"), true);
});

test("isPasswordSelector: rejects non-password selector", () => {
  assert.equal(isPasswordSelector("#email"), false);
});

test("isPasswordSelector: rejects empty string", () => {
  assert.equal(isPasswordSelector(""), false);
});

test("isPasswordSelector: case insensitive", () => {
  assert.equal(isPasswordSelector("#Password"), true);
});
