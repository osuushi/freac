import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";

if (process.platform !== "darwin") throw new Error("This checks macOS Finder launch behavior.");
const root = await mkdtemp(join(tmpdir(), "freac-finder-launch-"));
let app;
try {
  await writeFile(join(root, ".zshrc"), 'echo startup-banner\nexport PATH="$ZDOTDIR:$PATH"\n');
  await writeFile(join(root, "fixture-agent"), '#!/bin/sh\nexec /bin/sh "$@"\n', { mode: 0o700 });
  app = await launchElectron({
    ...(process.env.FREAC_TEST_EXECUTABLE
      ? { executablePath: process.env.FREAC_TEST_EXECUTABLE, args: [] }
      : { args: ["."] }),
    env: {
      ...process.env,
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
      ZDOTDIR: root,
      FREAC_TEST_HIDDEN: "1",
    },
  });
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "fixture-agent", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  const { workspace } = await waitAgent(page, true);
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type("fixture-agent -c 'printf ready > finder-check.txt'");
  await page.keyboard.press("Enter");
  let output;
  for (let attempt = 0; attempt < 100; attempt++) {
    output = await readFile(join(workspace, "finder-check.txt"), "utf8").catch(() => "");
    if (output === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(output, "ready", "terminal child tools inherit the recovered PATH");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await waitAgent(page, false);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Environment · NAME=value, one per line").fill("PATH=/usr/bin:/bin");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-message").filter({ hasText: "Could not start" }).waitFor();
  console.log("Finder PATH launch, terminal child PATH, Stop and explicit PATH precedence passed.");
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}

async function waitAgent(page, running) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const status = await page.evaluate(() => window.freacAgent.request({ kind: "settings" }));
    if (!status.error && status.running === running) return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Agent did not reach its expected lifecycle state.");
}
