import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { calculationTimeoutMs } from "../model/calculation-limits.js";
import { meshWireLimit } from "../model/mesh-wire.js";

/** A disposable calculation process: cancellation releases native memory and TBB threads. */
export class MeshCalculator {
  private active: { cancel: () => void; done: Promise<unknown> } | null = null;
  constructor(
    private executable = resolve(
      ".build/mesh/bin",
      process.platform === "win32" ? "makeshift-mesh.exe" : "makeshift-mesh",
    ),
  ) {}
  calculate(input: ArrayBuffer): Promise<ArrayBuffer> {
    if (this.active) return Promise.reject(new Error("Native export is busy"));
    if (
      !(input instanceof ArrayBuffer) ||
      input.byteLength < 20 ||
      input.byteLength > meshWireLimit
    )
      return Promise.reject(new Error("Invalid native export request"));
    const child = spawn(this.executable, [], { stdio: "pipe", windowsHide: true });
    let failure: Error | undefined;
    let force: ReturnType<typeof setTimeout> | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      force ??= setTimeout(() => child.kill("SIGKILL"), 250);
    };
    const timer = setTimeout(() => stop("Native export timed out"), calculationTimeoutMs);
    const done = new Promise<ArrayBuffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0,
        diagnostic = "";
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > meshWireLimit) stop("Native export result exceeds transfer budget");
        else if (!failure) chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-4096);
      });
      child.once("error", (error) => {
        failure = error;
      });
      child.stdin.on("error", () => stop("Native export input failed"));
      child.once("close", (code) => {
        clearTimeout(timer);
        clearTimeout(force);
        this.active = null;
        if (failure) reject(failure);
        else if (code !== 0)
          reject(new Error(diagnostic.trim() || "Native mesh integration failed"));
        else resolve(Uint8Array.from(Buffer.concat(chunks)).buffer);
      });
      child.stdin.end(Buffer.from(input));
    });
    this.active = { cancel: () => stop("Native export cancelled"), done };
    return done;
  }
  async cancel(): Promise<void> {
    const current = this.active;
    current?.cancel();
    await current?.done.catch(() => {});
  }
  close(): void {
    void this.cancel();
  }
}
