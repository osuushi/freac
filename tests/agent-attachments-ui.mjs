import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { launchElectron, saveDocument } from "./native-documents.mjs";

const source = process.env.FREAC_TEST_3MF;
assert(source, "Set FREAC_TEST_3MF to a 3MF reference for this integration check");
const bytes = await readFile(source);
const root = await mkdtemp(join(tmpdir(), "freac-attach-ui-"));
const executablePath = process.env.FREAC_PACKAGED_EXECUTABLE;
const app = await launchElectron({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? [] : ["."],
  env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  console.log("attachment test: window ready");
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  console.log("attachment test: agent running");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach 3MF…" }).click();
  await (await chooser).setFiles(source);
  console.log("attachment test: file selected");
  await page
    .locator(".agent-attachment")
    .filter({ hasText: basename(source) })
    .waitFor();
  const text = await page.locator(".agent-attachment").textContent();
  const relative = text.slice("Attached ".length, text.indexOf(". Ask the agent"));
  const before = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
  assert.deepEqual(await readFile(join(before.workspace, relative)), bytes);
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, true);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .locator(".agent-status")
    .filter({ hasText: /Exited|Stopped/ })
    .waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-start]").disabled);
  const saved = join(root, "attached.freac");
  console.log("attachment test: saving");
  await saveDocument(page, saved);
  await page.waitForFunction(() => !window.freacInspect().busy);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, saved);
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Open…")
      .click();
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
    if (state.workspace && state.workspace !== before.workspace) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const after = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
  assert.notEqual(after.workspace, before.workspace);
  assert.deepEqual(await readFile(join(after.workspace, relative)), bytes);
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, false);
  assert.equal((await page.evaluate(() => window.freacInspect())).document.bodies?.length ?? 0, 0);
  console.log(
    "PASS UI attachment: real file chooser, exact bytes, dirty state, save/reopen, unchanged empty geometry",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  const forceClose = setTimeout(() => app.process().kill("SIGKILL"), 3000);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await app.close();
  clearTimeout(forceClose);
  await rm(root, { recursive: true, force: true });
}
