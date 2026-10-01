import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { KernelRequest } from "../src/backend/kernel-request.js";

/** Observe actual stdin and optionally damage a real native reply at the wire boundary. */
export async function kernelWireFixture() {
  const directory = await mkdtemp(join(tmpdir(), "freac-kernel-wire-"));
  const executable = join(directory, "kernel.mjs");
  const capture = join(directory, "input.jsonl");
  const damage = join(directory, "damage");
  await writeFile(
    executable,
    `#!${process.execPath}
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
const child = spawn(${JSON.stringify(resolve(".build/kernel/bin/freac-kernel"))}, [], {stdio: "pipe"});
process.on("SIGTERM", () => child.kill());
child.once("exit", () => process.exit());
child.stderr.pipe(process.stderr);
createInterface({input: process.stdin}).on("line", line => {
  appendFileSync(${JSON.stringify(capture)}, line + "\\n");
  child.stdin.write(line + "\\n");
});
createInterface({input: child.stdout}).on("line", line => {
  const reply = JSON.parse(line);
  const damage = existsSync(${JSON.stringify(damage)}) ? readFileSync(${JSON.stringify(damage)}, "utf8") : "";
  if (damage === "center" && reply.results?.length) reply.results[0].center[0] = null;
  if (damage === "measurement" && reply.measurement) reply.measurement.distance.points[0][0] = null;
  console.log(JSON.stringify(reply));
});
`,
  );
  await chmod(executable, 0o755);
  return {
    executable,
    damage: (value: string) => writeFile(damage, value),
    inputs: async () =>
      (await readFile(capture, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as KernelRequest),
    close: () => rm(directory, { recursive: true, force: true }),
  };
}
