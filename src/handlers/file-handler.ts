import type { RunContext, AgentTask } from "../types";
import type { TaskExecutionOutput } from "./browser-handler";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Restrict file operations to project working directory for safety
const SAFE_ROOT = process.cwd();

function safePath(rawPath: string): string {
  const abs = resolve(SAFE_ROOT, rawPath);
  if (!abs.startsWith(SAFE_ROOT)) {
    throw new Error(`read_file/write_file: path "${rawPath}" is outside the working directory`);
  }
  return abs;
}

export async function handleReadFileTask(
  _context: RunContext,
  task: AgentTask
): Promise<TaskExecutionOutput> {
  const rawPath = String(task.payload.path ?? "");
  if (!rawPath) throw new Error("read_file: path is required");

  const filePath = safePath(rawPath);
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "read failed";
    throw new Error(`read_file: ${msg}`);
  }

  const maxLen = Number(task.payload.maxLength ?? 2000);
  const snippet = content.slice(0, maxLen);
  return {
    summary: `Read ${filePath} (${content.length} chars). Content: ${snippet}`,
    stateHints: [`read_file:${rawPath}`]
  };
}

export async function handleWriteFileTask(
  _context: RunContext,
  task: AgentTask
): Promise<TaskExecutionOutput> {
  const rawPath = String(task.payload.path ?? "");
  const content = String(task.payload.content ?? "");
  if (!rawPath) throw new Error("write_file: path is required");

  const filePath = safePath(rawPath);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write failed";
    throw new Error(`write_file: ${msg}`);
  }

  return {
    summary: `Wrote ${content.length} chars to ${filePath}`,
    stateHints: [`wrote_file:${rawPath}`]
  };
}
