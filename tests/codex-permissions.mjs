import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  codexPermissionOverrides,
  workspaceTrustOverride,
} from "../.build/host/host/agent-settings.js";

const codex = process.env.FREAC_CODEX_EXECUTABLE;
assert(codex, "Set FREAC_CODEX_EXECUTABLE to the installed Codex CLI");
const root = await realpath(await mkdtemp(join(tmpdir(), "freac-permissions-")));
const workspace = join(root, "workspace"),
  home = join(root, "codex");
const run = promisify(execFile);
try {
  await mkdir(workspace);
  await mkdir(home);
  await writeFile(
    join(home, "config.toml"),
    `
cli_auth_credentials_store="file"
check_for_update_on_startup=false
sandbox_mode="read-only"
approval_policy="on-request"
approvals_reviewer="user"
`,
  );
  await writeFile(join(home, "auth.json"), '{"OPENAI_API_KEY":"sk-test-not-a-real-key"}');
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CODEX_") || key.startsWith("OPENAI_")) delete env[key];
  env.CODEX_HOME = home;
  const options = { cwd: workspace, env, timeout: 20000, maxBuffer: 4 * 1024 * 1024 };
  const args = [...codexPermissionOverrides(), ...(await workspaceTrustOverride(workspace))];
  const prompt = await run(codex, ["debug", "prompt-input", ...args], options);
  assert.match(prompt.stdout, /workspace-write/);
  assert.match(prompt.stdout, /auto_review|automatic approval|automatic review/i);
  await run(
    codex,
    ["sandbox", ...args, "--", "/bin/sh", "-c", "printf 'allowed' > make-cup.ts"],
    options,
  );
  assert.equal(await readFile(join(workspace, "make-cup.ts"), "utf8"), "allowed");
  // Exclude the ordinary temporary-write allowances only for this boundary test.
  await assert.rejects(
    () =>
      run(
        codex,
        [
          "sandbox",
          ...args,
          "-c",
          "sandbox_workspace_write.exclude_tmpdir_env_var=true",
          "-c",
          "sandbox_workspace_write.exclude_slash_tmp=true",
          "--",
          "/bin/sh",
          "-c",
          "printf 'outside' > ../outside-workspace.txt",
        ],
        options,
      ),
    /Operation not permitted|Permission denied/,
  );
  console.log(
    "PASS actual Codex: workspace edits allowed over stale read-only config; automatic reviewer in prompt; parent boundary retained (no model prompt)",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
