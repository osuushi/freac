import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function writeAgentLauncher(directory: string): Promise<string> {
  const cli = join(directory, process.platform === "win32" ? "makeshift.cmd" : "makeshift");
  const entry = fileURLToPath(new URL("../agent-cli/main.js", import.meta.url));
  const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
  const cmdQuote = (s: string) => `"${s.replaceAll("%", "%%")}"`;
  const launcher =
    process.platform === "win32"
      ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset ELECTRON_RUN_AS_NODE=1\r\n${cmdQuote(process.execPath)} ${cmdQuote(entry)} %*\r\n`
      : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(process.execPath)} ${quote(entry)} "$@"\n`;
  await writeFile(cli, launcher, { mode: 0o700 });
  // Existing drawings can contain startup instructions using the former command.
  await writeFile(join(directory, process.platform === "win32" ? "freac.cmd" : "freac"), launcher, {
    mode: 0o700,
  });
  return cli;
}
