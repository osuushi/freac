import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { type FileHandle, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type AgentProcessIdentity,
  agentSessionRows,
  signalAgentGroups,
} from "./agent-process-tree.js";

// The quiet member keeps the PTY group occupied after the harness exits. Without it,
// a remembered root PID cannot safely identify a process group at a later Stop.
const launch = `_makeshift_scope_umask=$(umask)
umask 077
(trap '' HUP TERM; while IFS= read -r _makeshift_scope_keepalive; do :; done < "$1/hold") </dev/null >/dev/null 2>&1 &
printf '%s\\n' "$!" > "$1/anchor"
while [ ! -f "$1/ready" ]; do sleep 0.01; done
shift
umask "$_makeshift_scope_umask"
unset _makeshift_scope_umask
exec "$@"`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const execute = promisify(execFile);

/** One POSIX PTY session, including separate shell job-control groups. */
export class AgentProcessScope {
  private anchor: AgentProcessIdentity | null = null;
  private root: AgentProcessIdentity | null = null;
  private constructor(
    readonly directory: string,
    private executable: string,
    private keepalive: FileHandle,
  ) {}
  static async prepare(executable: string): Promise<AgentProcessScope> {
    const directory = await mkdtemp(join(tmpdir(), "makeshift-agent-scope-"));
    try {
      const hold = join(directory, "hold");
      await execute("/usr/bin/mkfifo", [hold], { timeout: 2000 });
      // The host is the only writer. Host exit closes this descriptor and ends the
      // quiet reader, so retaining process identity does not create an orphan helper.
      return new AgentProcessScope(
        directory,
        executable,
        await open(hold, constants.O_RDWR | constants.O_NONBLOCK),
      );
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  arguments(executable: string, args: string[]): string[] {
    return ["-c", launch, "makeshift-agent", this.directory, executable, ...args];
  }
  async release(root: number): Promise<void> {
    let anchor = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        anchor = Number(await readFile(join(this.directory, "anchor"), "utf8"));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await delay(10);
      }
    }
    const rows = await agentSessionRows(this.executable, root);
    this.root = rows.find((row) => row.pid === root && row.group === root) ?? null;
    this.anchor =
      rows.find((row) => row.pid === anchor && row.group === root && row.parent === root) ?? null;
    if (!this.root || !this.anchor)
      throw new Error("Could not establish the agent's process scope.");
    await writeFile(join(this.directory, "ready"), "", { mode: 0o600 });
  }
  private owned(rows: AgentProcessIdentity[]): boolean {
    const anchor = this.anchor;
    return !!anchor && rows.some((row) => sameProcess(row, anchor));
  }
  async stop(): Promise<void> {
    const root = this.root;
    if (!root) throw new Error("Agent process scope was not established.");
    const rows = await agentSessionRows(this.executable, root.pid);
    if (!this.owned(rows)) {
      if (rows.length) throw new Error("Cannot verify the agent's process group for cleanup.");
      return;
    }
    signalAgentGroups(
      rows.map((row) => row.group),
      "SIGTERM",
    );
    await delay(500);
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await agentSessionRows(this.executable, root.pid);
      if (!this.owned(current)) throw new Error("Agent process scope changed during cleanup.");
      const jobs = current.filter((row) => row.group !== root.pid);
      if (!jobs.length) {
        signalAgentGroups([root.pid], "SIGKILL");
        return;
      }
      signalAgentGroups(
        jobs.map((row) => row.group),
        "SIGKILL",
      );
      await delay(10);
    }
    throw new Error("Agent jobs did not stop; the document remains open.");
  }
  async dispose(): Promise<void> {
    await this.keepalive.close();
    await rm(this.directory, { recursive: true, force: true });
  }
}
function sameProcess(a: AgentProcessIdentity, b: AgentProcessIdentity): boolean {
  return a.pid === b.pid && a.group === b.group && a.started === b.started;
}
