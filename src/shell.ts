import { ChildProcess, spawn } from "node:child_process";

export interface AppProcessHandle {
  process: ChildProcess;
  command: string;
}

export function startApp(command: string, cwd = process.cwd()): AppProcessHandle {
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: "inherit"
  });

  return {
    process: child,
    command
  };
}

export async function stopApp(handle?: AppProcessHandle): Promise<void> {
  if (!handle || !handle.process.pid || handle.process.killed) {
    return;
  }

  if (process.platform === "win32") {
    await stopWindowsProcessTree(handle.process.pid);
    return;
  }

  await new Promise<void>((resolve) => {
    const child = handle.process;
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(forceKillTimer);
      child.removeListener("exit", onExit);
      resolve();
    };

    const onExit = (): void => {
      finish();
    };

    const forceKillTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      finish();
    }, 5000);

    child.once("exit", onExit);
    child.kill("SIGTERM");
  });
}

async function stopWindowsProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      shell: false
    });

    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(() => {
      killer.kill();
      finish();
    }, 5000);

    killer.once("exit", finish);
    killer.once("error", finish);
  });
}
