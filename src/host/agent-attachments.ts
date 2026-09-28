import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { agentAttachmentLimit } from "../agent/protocol.js";
import { portablePath, validatePortable } from "../model/portable-files.js";
import type { AgentWorkspace } from "./agent-workspace.js";

/** Copy a selected reference into the portable document without touching geometry. */
export async function attachAgentFile(
  workspace: AgentWorkspace,
  name: string,
  base64: string,
): Promise<string> {
  if (typeof name !== "string" || basename(name) !== name || !/\.3mf$/i.test(name))
    throw new Error("Choose a 3MF file.");
  portablePath(name);
  if (
    typeof base64 !== "string" ||
    base64.length > 4 * Math.ceil(agentAttachmentLimit / 3) ||
    /[^A-Za-z0-9+/=]/.test(base64)
  )
    throw new Error("The attachment must be a 3MF file of at most 20 MiB.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) throw new Error("Invalid attachment encoding.");
  if (bytes.length > agentAttachmentLimit || bytes.subarray(0, 4).toString("hex") !== "504b0304")
    throw new Error("The attachment must be a 3MF ZIP package of at most 20 MiB.");
  await workspace.ensure();
  const cwd = workspace.cwd;
  if (!cwd) throw new Error("Workspace was not created.");
  if ((await realpath(cwd)) !== cwd) throw new Error("Workspace contains a linked path.");
  const directory = await mkdtemp(join(cwd, "attachment-"));
  const path = join(directory, name);
  const attached = relative(cwd, path).replaceAll("\\", "/");
  try {
    validatePortable({ ...(await workspace.snapshot()), [`workspace/${attached}`]: bytes });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    await workspace.refresh();
    return attached;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
