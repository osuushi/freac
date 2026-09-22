import { type IPty, spawn } from "node-pty";
import type { AgentStatus } from "../agent/protocol.js";
import { agentDescendants, signalAgentProcesses } from "./agent-process-tree.js";

/** One PTY; backpressure bounds output while a renderer is absent or collapsed. */
export class AgentProcess {
  private pty: IPty | null = null;
  private output = "";
  private paused = false;
  private exitCode: number | undefined;
  private error: string | undefined;
  private exited: Promise<void> = Promise.resolve();
  get status(): Omit<AgentStatus, "workspace"> {
    return { running: !!this.pty, exitCode: this.exitCode, error: this.error };
  }
  start(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    cols: number,
    rows: number,
  ): void {
    if (this.pty) throw new Error("The agent is already running.");
    this.error = undefined;
    this.exitCode = undefined;
    this.output = "";
    this.paused = false;
    const pty = spawn(executable, args, { cwd, env, cols, rows, name: "xterm-256color" });
    this.pty = pty;
    this.exited = new Promise((resolve) => {
      pty.onData((data) => {
        this.output += data;
        if (this.output.length > 128 * 1024 && !this.paused) {
          pty.pause();
          this.paused = true;
        }
      });
      pty.onExit(({ exitCode }) => {
        this.exitCode = exitCode;
        if (this.pty === pty) this.pty = null;
        resolve();
      });
    });
  }
  read(): string {
    const output = this.output;
    this.output = "";
    if (this.paused) {
      this.pty?.resume();
      this.paused = false;
    }
    return output;
  }
  write(data: string): void {
    if (!this.pty) throw new Error("Start the agent first.");
    this.pty.write(data);
  }
  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, rows);
  }
  async stop(): Promise<void> {
    const pty = this.pty;
    if (!pty) return;
    const descendants = await agentDescendants(pty.pid);
    // Resume a throttled process before asking it to exit.
    if (this.paused) {
      pty.resume();
      this.paused = false;
    }
    signalAgentProcesses(descendants, "SIGTERM");
    pty.kill();
    // Children can ignore TERM even after the PTY parent has exited.
    await new Promise((resolve) => setTimeout(resolve, 500));
    signalAgentProcesses(descendants, "SIGKILL");
    if (this.pty === pty) pty.kill("SIGKILL");
    await this.exited;
  }
}
