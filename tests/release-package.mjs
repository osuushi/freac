import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";
import { settled } from "./ui-helpers.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const executablePath = resolve(
  process.env.FREAC_PACKAGED_EXECUTABLE ??
    ".build/packages/Freac-darwin-arm64/Freac.app/Contents/MacOS/Freac",
);
const env = { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", FREAC_TEST_HIDDEN: "1" };
for (const key of [
  "FREAC_DEV_URL",
  "ELECTRON_RUN_AS_NODE",
  "NODE_PATH",
  "DYLD_LIBRARY_PATH",
  "DYLD_FALLBACK_LIBRARY_PATH",
])
  delete env[key];
const app = await launchElectron({ executablePath, args: [], cwd: tmpdir(), env });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await settled(page);
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await extrudeRoute(page, "packaged");
  await terminalRoute(page);
  const opened = app.waitForEvent("window");
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "Help")
      .submenu.items.find((item) => item.label === "Third-party licenses")
      .click();
  });
  const licenses = await opened;
  await licenses.getByRole("heading", { name: "Third-party licenses" }).waitFor();
  assert.match(await licenses.locator("body").innerText(), /Open CASCADE Technology/);
  await licenses.screenshot({ path: ".cache/sketch-review/packaged-licenses-index.png" });
  await licenses
    .getByText("Chromium and Electron bundled component notices", { exact: true })
    .click();
  await licenses.getByText("ffmpeg", { exact: true }).first().waitFor();
  await licenses.screenshot({ path: ".cache/sketch-review/packaged-licenses.png" });
  await licenses.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS packaged arm64 app: unrelated cwd, restricted PATH, real sketch/extrude/cut/Undo/save/reopen, PTY/CLI, offline notices",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await app
    .windows()[0]
    ?.evaluate(() => window.freacAgent.request({ kind: "stop" }))
    .catch(() => {});
  await app
    .evaluate(({ app }) => {
      app.exit(0);
    })
    .catch(() => {});
  await app.close();
}

async function terminalRoute(page) {
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Preset" }).selectOption("custom");
  await page.getByLabel("Executable", { exact: true }).fill("/bin/sh");
  await page.getByLabel("Arguments · one per line").fill("-i");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(
    async () => (await window.freacAgent.request({ kind: "settings" })).running,
  );
  const { workspace } = await page.evaluate(() => window.freacAgent.request({ kind: "settings" }));
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type("freac status > packaged-status.json");
  await page.keyboard.press("Enter");
  const output = join(workspace, "packaged-status.json");
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await readFile(output, "utf8")).includes("Freac")) break;
    } catch {}
    await page.waitForTimeout(100);
  }
  await access(output);
  assert.match(await readFile(output, "utf8"), /Freac/);
  await page.keyboard.type(
    `printf '%s\\n' 'console.log("PACKAGED_SCRIPT_OK");' > packaged-check.ts; freac run packaged-check.ts > packaged-script.txt 2>&1; echo $? > packaged-script.exit`,
  );
  await page.keyboard.press("Enter");
  const exit = join(workspace, "packaged-script.exit");
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      await access(exit);
      break;
    } catch {
      /* The compiler/worker is still running. */
    }
    await page.waitForTimeout(100);
  }
  assert.equal(
    (await readFile(exit, "utf8")).trim(),
    "0",
    await readFile(join(workspace, "packaged-script.txt"), "utf8"),
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(
    async () => !(await window.freacAgent.request({ kind: "settings" })).running,
  );
}
