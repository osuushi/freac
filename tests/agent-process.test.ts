import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultAgentPreferences } from "../src/agent/protocol.js";
import { AgentProcess } from "../src/host/agent-process.js";
import { AgentSettings, agentPreferences } from "../src/host/agent-settings.js";

test("Codex configuration is separate, explicit env overrides survive, preferences are private", async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-settings-"));
  try {
    const settings = new AgentSettings(root);
    const value = { ...defaultAgentPreferences, env: { CODEX_TEST_EXPLICIT: "yes" } };
    await settings.save(value);
    assert.deepEqual(await settings.read(), value);
    const env = await settings.environment(value);
    assert.equal(env.CODEX_HOME, settings.directory);
    assert.equal(env.CODEX_TEST_EXPLICIT, "yes");
    assert.match(
      await readFile(join(settings.directory, "config.toml"), "utf8"),
      /cli_auth_credentials_store = "file"/,
    );
    if (process.platform !== "win32")
      assert.equal((await stat(join(root, "agent-preferences.json"))).mode & 0o777, 0o600);
    assert.throws(() => agentPreferences({ ...value, env: { CODEX_HOME: "/elsewhere" } }));
    assert.throws(() => agentPreferences({ ...value, args: [null] }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PTY stop kills a child that ignores TERM and retains workspace files", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-process-"));
  const pty = new AgentProcess();
  try {
    pty.start(
      "/bin/sh",
      ["-c", "trap '' TERM; (trap '' TERM; sleep 90) & echo $! > child.pid; wait"],
      root,
      process.env,
      80,
      24,
    );
    for (let i = 0; i < 100; i++) {
      try {
        await access(join(root, "child.pid"));
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    const child = Number(await readFile(join(root, "child.pid"), "utf8"));
    process.kill(child, 0);
    await pty.stop();
    assert.equal(pty.status.running, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.throws(
      () => process.kill(child, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH",
    );
    await access(join(root, "child.pid"));
  } finally {
    await pty.stop();
    await rm(root, { recursive: true, force: true });
  }
});
