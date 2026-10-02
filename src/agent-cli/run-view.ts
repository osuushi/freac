import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { compileScript } from "./compile-script.js";

/** View programs run with the caller's permissions and never acquire a geometry transaction. */
export async function runView(path: string): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-view-"));
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, interrupt);
  try {
    const entry = await compileScript(path, directory, "view");
    const result = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL("./view-worker.js", import.meta.url)), entry],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        signal: abort.signal,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      },
    );
    if (result.stderr) process.stderr.write(result.stderr);
    return JSON.parse(result.stdout);
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    throw new Error(failure.stderr?.trim() || failure.message || String(error));
  } finally {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
      process.removeListener(signal, interrupt);
    await rm(directory, { recursive: true, force: true });
  }
}
