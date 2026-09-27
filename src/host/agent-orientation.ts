import { writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InspectionCommand } from "../agent/inspection-protocol.js";
import { guide, types } from "../agent-cli/guide.js";
import { startupGuide } from "../agent-cli/startup-guide.js";
import type { ScriptRequest } from "../agent-script/api.js";
import type { DocumentStatus } from "../model/document-host.js";
import { AgentConnection } from "./agent-connection.js";

export const launchGuidance = `You are running inside Freac for one CAD drawing.\n${startupGuide}`;

export async function prepareOrientation(
  cwd: string,
  env: NodeJS.ProcessEnv,
  status: () => DocumentStatus,
  inspect: (
    command: InspectionCommand,
    entity: string | undefined,
    directory: string,
  ) => Promise<unknown>,
  script: (request: ScriptRequest, channel: string) => Promise<unknown>,
): Promise<AgentConnection> {
  const connection = await AgentConnection.create((request, directory) => {
    const current = status();
    if (request.command === "script") {
      if (!request.script) throw new Error("Invalid script request");
      return script(request.script, directory);
    }
    if (request.command !== "status") return inspect(request.command, request.entity, directory);
    return {
      application: "Freac",
      document: { name: current.name, saved: !!current.path, edited: current.edited, units: "mm" },
      capabilities: [
        "help",
        "docs",
        "types",
        "status",
        "selection",
        "select",
        "inspect",
        "render",
        "run",
        "view",
        "faces",
        "context",
      ],
    };
  });
  try {
    await writeFile(join(cwd, "AGENTS.md"), startupGuide, { flag: "wx", mode: 0o600 }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
    const cli = join(connection.directory, process.platform === "win32" ? "freac.cmd" : "freac");
    const entry = fileURLToPath(new URL("../agent-cli/main.js", import.meta.url));
    const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
    const cmdQuote = (s: string) => `"${s.replaceAll("%", "%%")}"`;
    const launcher =
      process.platform === "win32"
        ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset ELECTRON_RUN_AS_NODE=1\r\n${cmdQuote(process.execPath)} ${cmdQuote(entry)} %*\r\n`
        : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(process.execPath)} ${quote(entry)} "$@"\n`;
    await writeFile(cli, launcher, { mode: 0o700 });
    const docs = join(connection.directory, "freac.md"),
      api = join(connection.directory, "freac.d.ts");
    await writeFile(docs, guide, { mode: 0o600 });
    await writeFile(api, types, { mode: 0o600 });
    Object.assign(env, {
      FREAC_CLI: cli,
      FREAC_WORKSPACE: cwd,
      FREAC_ENDPOINT: connection.directory,
      FREAC_CAPABILITY: connection.capability,
      FREAC_DOCS: docs,
      FREAC_API_TYPES: api,
      PATH: `${connection.directory}${delimiter}${env.PATH ?? ""}`,
    });
    return connection;
  } catch (error) {
    await connection.close();
    throw error;
  }
}

export function orientationOverrides(env: NodeJS.ProcessEnv): string[] {
  const keys = [
    "FREAC_CLI",
    "FREAC_WORKSPACE",
    "FREAC_ENDPOINT",
    "FREAC_CAPABILITY",
    "FREAC_DOCS",
    "FREAC_API_TYPES",
    "PATH",
  ];
  const values = keys.map((key) => [key, env[key]]);
  return [
    "-c",
    `developer_instructions=${JSON.stringify(launchGuidance)}`,
    ...values.flatMap(([key, value]) => [
      "-c",
      `shell_environment_policy.set.${key}=${JSON.stringify(value)}`,
    ]),
  ];
}
