import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Capture descendants before their parent exits and they become reparented. */
export async function agentDescendants(parent: number): Promise<number[]> {
  if (process.platform === "win32") return []; // ConPTY closes its process tree.
  const { stdout } = await execute("/bin/ps", ["-axo", "pid=,ppid="], { timeout: 2000 });
  const rows = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const result = new Set([parent]);
  let previous = 0;
  while (result.size !== previous) {
    previous = result.size;
    for (const [pid, ppid] of rows) if (result.has(ppid)) result.add(pid);
  }
  result.delete(parent);
  return [...result].reverse();
}

export function signalAgentProcesses(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
