import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { AgentProcess } from "../src/host/agent-process.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => Promise<boolean> | boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await condition()) return;
    await delay(10);
  }
  assert.fail("owned process condition did not settle");
}
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("natural root exit retains cleanup ownership and cannot affect another PTY", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-natural-"));
  const first = new AgentProcess(),
    second = new AgentProcess();
  try {
    await second.start(
      "/bin/sh",
      ["-c", "while :; do echo other >> other.log; sleep .02; done"],
      root,
      process.env,
      80,
      24,
    );
    await first.start(
      "/bin/sh",
      [
        "-c",
        "trap '' HUP; (trap '' HUP TERM; while :; do echo tick >> writer.log; sleep .02; done) >/dev/null 2>&1 & echo $! > child.pid; sleep .1; exit 7",
      ],
      root,
      process.env,
      80,
      24,
    );
    await waitFor(() => exists(join(root, "child.pid")));
    const child = Number(await readFile(join(root, "child.pid"), "utf8"));
    await waitFor(() => first.status.exitCode === 7);
    assert.equal(first.status.running, true, "cleanup remains active after the PTY root exits");
    await first.stop();
    assert.equal(first.status.running, false);
    assert.equal(first.status.exitCode, 7);
    const before = await readFile(join(root, "writer.log"), "utf8");
    const otherBefore = await readFile(join(root, "other.log"), "utf8");
    await delay(150);
    assert.equal(await readFile(join(root, "writer.log"), "utf8"), before);
    assert.ok((await readFile(join(root, "other.log"), "utf8")).length > otherBefore.length);
    assert.equal(second.status.running, true, "separate PTY keeps its own process group");
    assert.throws(
      () => process.kill(child, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH",
    );
  } finally {
    await Promise.all([first.stop(), second.stop()]);
    await rm(root, { recursive: true, force: true });
  }
});

test("gated launch preserves literal arguments, cwd, environment and root exit code", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-launch-"));
  const pty = new AgentProcess();
  const literal = 'literal `whoami` $(env) ; "quotes"';
  try {
    const starting = pty.start(
      "/bin/sh",
      ["-c", 'printf "%s\\n%s\\n" "$1" "$FREAC_SCOPE_LITERAL" > result; exit 3', "test", literal],
      root,
      { ...process.env, FREAC_SCOPE_LITERAL: "preserved" },
      80,
      24,
    );
    await assert.rejects(pty.start("/bin/sh", [], root, process.env, 80, 24), /already running/);
    await starting;
    await waitFor(() => pty.status.exitCode === 3);
    await pty.stop();
    assert.equal(await readFile(join(root, "result"), "utf8"), `${literal}\npreserved\n`);
    assert.equal(pty.status.running, false);
    assert.equal(pty.status.error, undefined);
  } finally {
    await pty.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("natural exit also stops HUP/TERM-resistant shell job-control groups", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-jobs-"));
  const pty = new AgentProcess();
  try {
    await pty.start("/bin/sh", ["-i"], root, process.env, 80, 24);
    pty.write(
      "trap '' HUP; (trap '' HUP TERM; while :; do echo tick >> writer.log; sleep .02; done) >/dev/null 2>&1 & echo $! > child.pid; ps -o pgid= -p $$ > root.group; ps -o pgid= -p $! > child.group; sleep .1; exit\r",
    );
    await waitFor(() => exists(join(root, "child.group")));
    const group = Number(await readFile(join(root, "child.group"), "utf8"));
    assert.notEqual(
      group,
      Number(await readFile(join(root, "root.group"), "utf8")),
      "interactive shell actually created a separate group",
    );
    await waitFor(() => pty.status.exitCode === 0);
    await pty.stop();
    const before = await readFile(join(root, "writer.log"), "utf8");
    await delay(150);
    assert.equal(await readFile(join(root, "writer.log"), "utf8"), before);
    assert.equal(pty.status.error, undefined);
    assert.throws(
      () => process.kill(-group, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH",
    );
  } finally {
    await pty.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("failed scope inspection retires gated launch and permits a corrected Start", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-agent-failed-launch-"));
  const helper = join(root, "scope-helper");
  const pty = new AgentProcess(helper);
  try {
    await assert.rejects(
      pty.start("/bin/sh", ["-c", "touch forbidden"], root, process.env, 80, 24),
      /ENOENT/,
    );
    await pty.stop();
    assert.equal(pty.status.running, false);
    assert.equal(
      await exists(join(root, "forbidden")),
      false,
      "failed inspection never launches the harness",
    );
    await symlink(resolve(".build/host-native/bin/freac-agent-scope"), helper);
    await pty.start("/bin/sh", ["-c", "touch corrected"], root, process.env, 80, 24);
    await waitFor(() => pty.status.exitCode === 0);
    await pty.stop();
    await access(join(root, "corrected"));
    assert.equal(pty.status.error, undefined);
  } finally {
    await pty.stop();
    await rm(root, { recursive: true, force: true });
  }
});
