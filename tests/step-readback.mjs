import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Independent STEP reader; build with MAKESHIFT_KERNEL_TESTS=ON before running UI acceptance. */
export function readStep(path) {
  const executable = resolve(
    ".build/kernel/bin",
    process.platform === "win32" ? "step-readback.exe" : "step-readback",
  );
  return JSON.parse(execFileSync(executable, [path], { encoding: "utf8" }));
}
