import { writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InspectionCommand } from "../agent/inspection-protocol.js";
import { guide, types } from "../agent-cli/guide.js";
import type { ScriptRequest } from "../agent-script/api.js";
import type { DocumentStatus } from "../model/document-host.js";
import { AgentConnection } from "./agent-connection.js";

export const launchGuidance =
  "You are running inside Freac for one CAD drawing. " +
  "Run freac help, freac docs and freac status to discover the current interface and drawing. " +
  "Use plain freac commands; the launcher is already on PATH. Only if freac is not found, invoke the quoted absolute path in FREAC_CLI. Help/docs/types/status can run in parallel with inspection. Concurrent selection/inspect/render requests wait their turn on the shared measurement worker. Await modeling operations sequentially. " +
  "FREAC_WORKSPACE is the current portable files directory. Write scripts and notes there, using relative paths from that directory. Old absolute workspace paths in resumed conversations are stale; its parent is application state, not the workspace. " +
  "The installed freac docs and help supersede older capability statements in workspace notes or conversation history. " +
  "freac.revolve supports continuous helical sweeps using a signed angle and total axial height, including Boolean cuts/unions. Do not infer missing manual tools from an older script API or invent an enable-tool step. " +
  "When the user says 'this', 'these', or similar, normally interpret it as the specific current selection. Run freac selection first: selected sketch parts (points, curves, regions), sketches, faces, edges, bodies, or any combination are the intended scope unless the user explicitly says otherwise. Preserve that scope; do not silently expand a face or edge to its entire body, sketch parts to a whole sketch, or discard members of a mixed selection. " +
  "Selection is a reference aid, not a prerequisite for editing. For follow-ups and corrections, use the target established by the conversation, previous inspection and your own script/results; an empty live selection does not erase that context. Re-inspect current geometry to verify IDs and relevant boundaries. A request to extend or fix your previous result can explicitly change its earlier scope. " +
  "Before asking for clarification, inspect the established target and your previous work. Proceed when context and geometry identify the intended edit. Ask a specific question only if materially different interpretations remain; do not demand reselection solely because live selection is empty or a body has multiple faces/sections. For a fresh selected-face request, use the face's bounded extent rather than assuming whole-body dimensions. " +
  "Use freac inspect for geometry and freac render for a viewport PNG. Use freac run script.ts for typed modeling; read freac docs and types first. Each successful script is one Undo step. " +
  "Never discover or use another launch's connection. Keep project guidance in AGENTS.md.";

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
      capabilities: ["help", "docs", "types", "status", "selection", "inspect", "render", "run"],
    };
  });
  try {
    await writeFile(join(cwd, "AGENTS.md"), guide, { flag: "wx", mode: 0o600 }).catch(
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
