import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AgentPreferences, defaultAgentPreferences } from "../agent/protocol.js";
import { safeWrite } from "./safe-write.js";

export function agentPreferences(value: unknown): AgentPreferences {
  const p = value as AgentPreferences;
  if (
    !p ||
    !["codex", "custom"].includes(p.preset) ||
    typeof p.executable !== "string" ||
    !p.executable.trim() ||
    p.executable.includes("\0") ||
    !Array.isArray(p.args) ||
    p.args.length > 128 ||
    !p.args.every((arg) => typeof arg === "string" && !arg.includes("\0")) ||
    !p.env ||
    typeof p.env !== "object" ||
    Array.isArray(p.env)
  )
    throw new Error("Specify an executable, argument list and environment variables.");
  for (const [key, value] of Object.entries(p.env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0"))
      throw new Error("Environment names and values must be valid strings.");
    if (p.preset === "codex" && key === "CODEX_HOME")
      throw new Error("The Codex preset manages CODEX_HOME. Use Custom to override it.");
  }
  return {
    preset: p.preset,
    executable: p.executable.trim(),
    args: [...p.args],
    env: { ...p.env },
  };
}

export class AgentSettings {
  readonly directory: string;
  private file: string;
  constructor(root: string) {
    this.directory = join(root, "agent", "codex");
    this.file = join(root, "agent-preferences.json");
  }
  async read(): Promise<AgentPreferences> {
    try {
      return agentPreferences(JSON.parse(await readFile(this.file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return structuredClone(defaultAgentPreferences);
      throw error;
    }
  }
  async save(value: unknown): Promise<AgentPreferences> {
    const settings = agentPreferences(value);
    await safeWrite(this.file, JSON.stringify(settings, null, 2), 0o600);
    return settings;
  }
  async environment(settings: AgentPreferences): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: "xterm-256color" };
    if (settings.preset === "codex") {
      // Do not inherit the embedding agent's own runtime/session overrides.
      for (const key of Object.keys(env))
        if (key.startsWith("CODEX_") || key.startsWith("OPENAI_")) delete env[key];
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(this.directory, "config.toml"),
        'cli_auth_credentials_store = "file"\n',
        { flag: "wx", mode: 0o600 },
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      env.CODEX_HOME = this.directory;
    }
    Object.assign(env, settings.env);
    return env;
  }
}

/** Default Codex launches to workspace writes with automatic approval review. */
export function codexPermissionOverrides(): string[] {
  return [
    "-c",
    'sandbox_mode="workspace-write"',
    "-c",
    'approval_policy="on-request"',
    "-c",
    'approvals_reviewer="auto_review"',
  ];
}

/** Trust only this Freac-owned workspace, using a launch-local Codex override. */
export async function workspaceTrustOverride(workspace: string): Promise<string[]> {
  const path = await realpath(workspace);
  return ["-c", `projects={${JSON.stringify(path)}={trust_level="trusted"}}`];
}

/** Codex also discovers personal skills outside CODEX_HOME. Disable them per launch. */
export async function personalSkillOverrides(): Promise<string[]> {
  const skills: string[] = [];
  const visited = new Set<string>();
  async function scan(directory: string): Promise<void> {
    const canonical = await realpath(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!canonical || visited.has(canonical)) return;
    visited.add(canonical);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.name === "SKILL.md" && entry.isFile())) {
      skills.push(join(directory, "SKILL.md"));
      return;
    }
    for (const entry of entries)
      if (entry.isDirectory() || entry.isSymbolicLink()) await scan(join(directory, entry.name));
  }
  await scan(join(homedir(), ".agents", "skills"));
  return skills.length
    ? [
        "-c",
        `skills.config=[${skills.map((path) => `{path=${JSON.stringify(path)},enabled=false}`).join(",")}]`,
      ]
    : [];
}
