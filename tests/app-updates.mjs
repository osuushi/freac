import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-updates-"));
const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
try {
  const page = await app.firstWindow();
  await settled(page);
  await app.evaluate(({ autoUpdater, dialog }) => {
    globalThis.updatePrompts = [];
    globalThis.updateResponse = 1;
    globalThis.saveResponse = 1;
    globalThis.installs = 0;
    autoUpdater.quitAndInstall = () => {
      globalThis.installs++;
    };
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      globalThis.updatePrompts.push(options.message);
      return {
        response:
          options.buttons?.[0] === "Save" ? globalThis.saveResponse : globalThis.updateResponse,
      };
    };
  });
  await checkMenu();
  assert.match((await prompts()).at(-1), /signed macOS release/);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.keyboard.press("Escape");
  await settled(page);
  const before = await page.evaluate(() => JSON.stringify(window.freacInspect().document));

  // The OS download/install transport is stubbed; document handling is the real app.
  await app.evaluate(({ autoUpdater }) => {
    autoUpdater.emit("update-downloaded", {}, "", "Freac test update");
  });
  assert.match((await prompts()).at(-1), /update is ready/);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);

  await app.evaluate(() => {
    globalThis.updateResponse = 0;
  });
  await checkMenu();
  await page.waitForFunction(() => !window.freacInspect().busy);
  await waitForPrompts(4);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(window.freacInspect().document)), before);

  // Canceling the save-file picker must also leave the updater pending.
  await app.evaluate(({ dialog }) => {
    globalThis.saveResponse = 0;
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });
  await checkMenu();
  await waitForPrompts(6);
  await page.waitForFunction(() => !window.freacInspect().busy);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);

  const file = join(root, "before-update.freac");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await checkMenu();
  for (let i = 0; i < 100; i++) {
    if (await app.evaluate(() => globalThis.installs === 1)) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.equal(await app.evaluate(() => globalThis.installs), 1);
  assert((await readFile(file)).length > 100);
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, false);
  // A native installation error must restore the ordinary close/save guard.
  await app.evaluate(({ autoUpdater }) => {
    autoUpdater.emit("error", new Error("Simulated installer failure"));
    globalThis.saveResponse = 1;
  });
  await page.keyboard.press("r");
  await drag(page, [15, 10], [25, 20]);
  await page.keyboard.press("Escape");
  await settled(page);
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, true);
  const count = (await prompts()).length;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await waitForPrompts(count + 1);
  assert.equal(page.isClosed(), false);
  assert.equal(await app.evaluate(() => globalThis.installs), 1);
  console.log(
    "PASS hidden Electron: update menu, Later, unsaved-work Cancel, canceled Save As, save before install, installer failure restores close guard; OS transport stubbed",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close();
  await rm(root, { recursive: true, force: true });
}

async function checkMenu() {
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "Freac")
      .submenu.items.find((item) => item.label === "Check for Updates…")
      .click();
  });
}
async function prompts() {
  return app.evaluate(() => globalThis.updatePrompts);
}
async function waitForPrompts(count) {
  for (let i = 0; i < 100 && (await prompts()).length < count; i++)
    await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((await prompts()).length, count);
}
