import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentProcess } from "../.build/host/host/agent-process.js";
import { workspaceTrustOverride } from "../.build/host/host/agent-settings.js";
import { AgentWorkspace } from "../.build/host/host/agent-workspace.js";
import { codexResumeArgs } from "../.build/host/host/codex-workspace.js";
import { documentArchive } from "../.build/host/model/document-archive.js";
import {
  readPortableArchive,
  writePortableArchive,
} from "../.build/host/model/portable-archive.js";

const executable = process.env.FREAC_CODEX_EXECUTABLE;
assert(executable, "Set FREAC_CODEX_EXECUTABLE to the installed Codex executable.");
const root = await mkdtemp(join(tmpdir(), "freac-codex-portability-"));
const pty = new AgentProcess();
const workspace = new AgentWorkspace(join(root, "workspaces"));
try {
  const id = "d4f8c41a-1de6-4a0c-a8b9-9c3746ec651e",
    timestamp = "2026-09-20T00:00:00.000Z";
  const records = `${[
    {
      type: "session_meta",
      payload: {
        id,
        timestamp,
        cwd: "/another-machine/old-workspace",
        originator: "codex_cli_rs",
        cli_version: "0.155.1",
        source: "cli",
        model_provider: "openai",
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "PORTABLE_USER_MARKER" }],
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "PORTABLE_USER_MARKER",
        images: [],
        local_images: [],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "PORTABLE_REPLY_MARKER" }],
      },
    },
    { type: "event_msg", payload: { type: "agent_message", message: "PORTABLE_REPLY_MARKER" } },
  ]
    .map((record) => JSON.stringify({ timestamp, ...record }))
    .join("\n")}\n`;
  const files = {
    [`conversations/codex/sessions/2026/09/20/rollout-2026-09-20T00-00-00-${id}.jsonl`]:
      new TextEncoder().encode(records),
  };
  const saved = writePortableArchive(documentArchive({ units: "mm", sketches: [] }), files);
  const restored = readPortableArchive(saved);
  workspace.adopt(await workspace.prepare(restored.files), restored.files);
  const home = workspace.codexHome,
    cwd = workspace.cwd;
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, "auth.json"),
    JSON.stringify({ OPENAI_API_KEY: "sk-test-not-a-real-key" }),
  );
  await writeFile(
    join(home, "config.toml"),
    'cli_auth_credentials_store="file"\ncheck_for_update_on_startup=false\n',
  );
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CODEX_") || key.startsWith("OPENAI_")) delete env[key];
  env.CODEX_HOME = home;
  env.TERM = "xterm-256color";
  pty.start(
    executable,
    [
      ...codexResumeArgs(restored.files, cwd),
      "--no-alt-screen",
      ...(await workspaceTrustOverride(cwd)),
    ],
    cwd,
    env,
    120,
    40,
  );
  let output = "";
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const chunk = pty.read();
    output += chunk;
    if (chunk.includes("\x1b[6n")) pty.write("\x1b[1;1R");
    if (output.includes("PORTABLE_REPLY_MARKER")) break;
  }
  const text = output.replace(new RegExp(`${String.fromCharCode(27)}[[0-?]*[ -/]*[@-~]`, "g"), "");
  assert.match(text, /PORTABLE_USER_MARKER/);
  assert.match(text, /PORTABLE_REPLY_MARKER/);
  assert(!text.includes("Do you trust the contents"));
  console.log(
    "PASS actual Codex: archived conversation resumes in a fresh home at a different workspace path (no prompt sent)",
  );
} finally {
  await pty.stop();
  workspace.adopt(null, {});
  await rm(root, { recursive: true, force: true });
}
