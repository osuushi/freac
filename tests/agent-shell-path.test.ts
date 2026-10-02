import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { agentExecutable } from "../src/host/agent-executable.js";
import { agentShellPath } from "../src/host/agent-shell-path.js";

test("Finder PATH discovers shell-installed executables despite startup banners", {
  skip: process.platform !== "darwin",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-shell-path-"));
  try {
    await writeFile(join(root, ".zshrc"), 'echo startup-banner\nexport PATH="$ZDOTDIR:$PATH"\n');
    const command = join(root, "fixture-agent");
    await writeFile(command, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const env = { PATH: "/usr/bin:/bin", SHELL: "/bin/zsh", ZDOTDIR: root };
    await assert.rejects(agentExecutable("fixture-agent", root, env));
    const path = await agentShellPath(env);
    assert.equal(await agentExecutable("fixture-agent", root, { ...env, PATH: path }), command);
    assert.equal(await agentShellPath({ ...env, SHELL: "/missing-shell" }), env.PATH);
    await writeFile(join(root, ".zshrc"), "exit 0\n");
    assert.equal(await agentShellPath(env), env.PATH);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
