import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { launchElectron } from "../../tests/native-documents.mjs";

export const run = promisify(execFile);
export async function gearSession() {
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.freacAgent.request({
        kind: "configure",
        preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
      }),
    );
    await page.getByRole("button", { name: "Open agent terminal" }).click();
    await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
    const { workspace } = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type(
      'printf "%s\\n" "$FREAC_CLI" "$FREAC_ENDPOINT" "$FREAC_CAPABILITY" "$FREAC_DOCS" "$FREAC_API_TYPES" "$FREAC_WORKSPACE" "$PATH" > eval-env.txt',
    );
    await page.keyboard.press("Enter");
    let values;
    for (let i = 0; i < 100; i++) {
      values = await readFile(join(workspace, "eval-env.txt"), "utf8")
        .then((s) => s.trimEnd().split("\n"))
        .catch(() => []);
      if (values.length === 7) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(values.length, 7);
    await rm(join(workspace, "eval-env.txt"));
    const keys = [
      "FREAC_CLI",
      "FREAC_ENDPOINT",
      "FREAC_CAPABILITY",
      "FREAC_DOCS",
      "FREAC_API_TYPES",
      "FREAC_WORKSPACE",
      "PATH",
    ];
    const env = { ...process.env, ...Object.fromEntries(keys.map((k, i) => [k, values[i]])) };
    const cli = async (...args) =>
      JSON.parse(
        (
          await run(env.FREAC_CLI, args, {
            env,
            cwd: workspace,
            timeout: 180000,
            maxBuffer: 16 * 1024 * 1024,
          })
        ).stdout,
      );
    return {
      app,
      page,
      workspace,
      env,
      cli,
      close: async () => {
        await page.evaluate(() => window.freacAgent.request({ kind: "stop" })).catch(() => {});
        await app.close();
      },
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
