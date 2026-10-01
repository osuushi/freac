import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export interface AgentProcessIdentity {
  pid: number;
  parent: number;
  group: number;
  started: string;
}
export async function agentSessionRows(
  executable: string,
  session: number,
): Promise<AgentProcessIdentity[]> {
  const { stdout } = await execute(executable, [String(session)], {
    timeout: 2000,
    windowsHide: true,
  });
  return stdout.trim()
    ? stdout
        .trim()
        .split("\n")
        .map((line) => {
          const [pid, parent, group, started, extra] = line.trim().split(/\s+/);
          if (
            extra !== undefined ||
            ![pid, parent, group].every((value) => /^\d+$/.test(value)) ||
            !/^\d+(?::\d+)?$/.test(started)
          )
            throw new Error("Invalid process-scope reply");
          const row = { pid: Number(pid), parent: Number(parent), group: Number(group), started };
          if (
            ![row.pid, row.parent, row.group].every(Number.isSafeInteger) ||
            row.pid <= 0 ||
            row.group <= 0
          )
            throw new Error("Invalid process-scope identity");
          return row;
        })
    : [];
}
export function signalAgentGroups(groups: number[], signal: NodeJS.Signals): void {
  for (const group of new Set(groups)) {
    if (!Number.isSafeInteger(group) || group <= 0) throw new Error("Invalid process group");
    try {
      process.kill(-group, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
