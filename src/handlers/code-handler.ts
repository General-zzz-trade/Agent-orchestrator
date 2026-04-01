import { execFileNoThrow } from "../utils/execFileNoThrow";
import type { RunContext, AgentTask } from "../types";
import type { TaskExecutionOutput } from "./browser-handler";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

export async function handleCodeTask(
  context: RunContext,
  task: AgentTask
): Promise<TaskExecutionOutput> {
  const language = String(task.payload.language ?? "javascript");
  const code = String(task.payload.code ?? "");
  const timeoutMs = Number(task.payload.timeoutMs ?? 10000);

  if (!code.trim()) {
    throw new Error("run_code: code payload is empty");
  }

  const supported = ["javascript", "python", "shell"];
  if (!supported.includes(language)) {
    throw new Error(`run_code: unsupported language "${language}". Use: ${supported.join(", ")}`);
  }

  // Write code to a temp file
  const tmpDir = join(tmpdir(), "agent-code");
  mkdirSync(tmpDir, { recursive: true });
  const ext = language === "javascript" ? "mjs" : language === "python" ? "py" : "sh";
  const filename = `${randomBytes(8).toString("hex")}.${ext}`;
  const filepath = join(tmpDir, filename);
  writeFileSync(filepath, code, "utf8");

  let result: { stdout: string; stderr: string; status: number };

  try {
    if (language === "javascript") {
      result = await execFileNoThrow("node", [filepath], { timeoutMs });
    } else if (language === "python") {
      result = await execFileNoThrow("python3", [filepath], { timeoutMs });
    } else {
      // shell — use sh, pass filepath as arg (never interpolate into shell string)
      result = await execFileNoThrow("sh", [filepath], { timeoutMs });
    }
  } finally {
    try { unlinkSync(filepath); } catch { /* ignore cleanup errors */ }
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  if (result.status !== 0) {
    throw new Error(`run_code (${language}) exited ${result.status}: ${output.slice(0, 500)}`);
  }

  // Store output as artifact
  if (output) {
    context.artifacts.push({
      type: "code_output",
      path: `code-output/${task.id}`,
      description: `Output of run_code (${language})`,
      taskId: task.id
    });
  }

  return {
    summary: `Executed ${language} code, exit 0. Output: ${output.slice(0, 200) || "(empty)"}`
  };
}
