import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { types } from "./guide.js";

/** Typecheck the exact source snapshot which will execute, outside the document owner. */
export async function compileScript(path: string, directory: string): Promise<string> {
  if (!path.endsWith(".ts")) throw new Error("Use a single TypeScript .ts script");
  const source = await readFile(resolve(path), "utf8");
  if (Buffer.byteLength(source) > 256 * 1024) throw new Error("Script exceeds 256 KiB");
  await writeFile(join(directory, "script.mts"), source, { mode: 0o600 });
  await writeFile(join(directory, "api.d.ts"), types);
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        types: [],
        lib: ["ES2022", "DOM"],
        skipLibCheck: true,
        noEmitOnError: true,
        outDir: "out",
        rootDir: ".",
      },
      files: ["script.mts", "api.d.ts"],
    }),
  );
  const require = createRequire(import.meta.url);
  const compiler = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  try {
    await promisify(execFile)(
      process.execPath,
      [compiler, "-p", join(directory, "tsconfig.json")],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string };
    throw new Error(
      `Script typecheck failed; geometry unchanged.\n${output.stdout ?? ""}${output.stderr ?? String(error)}`,
    );
  }
  return join(directory, "out/script.mjs");
}
