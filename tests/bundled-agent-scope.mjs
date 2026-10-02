import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AgentProcess } from "../.build/host/host/agent-process.js";
import { bundleNative, inspectMachO } from "../scripts/release/native.mjs";

assert.equal(process.platform, "darwin", "This checks the macOS release bundle");
const root = await mkdtemp(join(tmpdir(), "makeshift-scope-bundle-"));
const agent = new AgentProcess(join(root, "native", "makeshift-agent-scope"));
try {
  await bundleNative(join(root, "native"), resolve(process.env.OCCT_ROOT ?? ".cache/kernel/sdk"));
  const helper = join(root, "native", "makeshift-agent-scope");
  assert.ok((await stat(helper)).mode & 0o111);
  execFileSync("codesign", ["--verify", "--strict", helper]);
  assert.match(inspectMachO(helper, "-l"), /minos 14\.0/);
  await agent.start("/bin/sh", ["-c", "exit 4"], root, process.env, 80, 24);
  for (let attempt = 0; attempt < 200 && agent.status.running; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  await agent.stop();
  assert.equal(agent.status.exitCode, 4);
  assert.equal(agent.status.error, undefined);
  console.log(
    "macOS: relocated signed native bundle loads process helper and preserves root exit code",
  );
} finally {
  await agent.stop();
  await rm(root, { recursive: true, force: true });
}
