import { execFile } from "node:child_process";

export interface ExecFileResult {
  stdout: string;
  stderr: string;
  status: number;
}

export interface ExecFileOptions {
  timeoutMs?: number;
  cwd?: string;
}

/**
 * Runs an executable file with arguments without using a shell.
 * Never throws — instead returns exit status in the result.
 * Uses execFile (not exec) to prevent shell injection.
 */
export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<ExecFileResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      {
        timeout: options.timeoutMs,
        cwd: options.cwd,
        shell: false
      },
      (error, stdout, stderr) => {
        const status =
          error?.code != null && typeof error.code === "number"
            ? error.code
            : error
              ? 1
              : 0;

        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          status
        });
      }
    );

    // Handle timeout explicitly — child process may still be alive
    child.on("error", () => {
      // Errors are already handled in the callback above
    });
  });
}
