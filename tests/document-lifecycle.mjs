import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-documents-"));
const path = join(root, "Drawing.freac");
let app, page;
async function launch() {
  app = await _electron.launch({
    args: [".", `--user-data-dir=${join(root, "profile")}`],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await settled(page);
  await app.evaluate(({ dialog }) => {
    globalThis.answers = [];
    globalThis.savePaths = [];
    globalThis.openPaths = [];
    globalThis.prompts = 0;
    globalThis.dialogDefaults = [];
    dialog.showMessageBox = async () => {
      globalThis.prompts++;
      return { response: globalThis.answers.shift() ?? 1 };
    };
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.dialogDefaults.push({ kind: "save", path: options.defaultPath });
      const filePath = globalThis.savePaths.shift();
      return { canceled: !filePath, filePath };
    };
    dialog.showOpenDialog = async (_window, options) => {
      globalThis.dialogDefaults.push({ kind: "open", path: options.defaultPath });
      const filePath = globalThis.openPaths.shift();
      return { canceled: !filePath, filePaths: filePath ? [filePath] : [] };
    };
  });
}
async function menu(label, group = "File") {
  await app.evaluate(
    ({ Menu }, { label, group }) => {
      const item = Menu.getApplicationMenu()
        .items.find((item) => item.label === group)
        .submenu.items.find((item) => item.label === label);
      item.click();
    },
    { label, group },
  );
  await page.waitForTimeout(120);
  await settled(page);
}
async function answer(response) {
  await app.evaluate((_, response) => globalThis.answers.push(response), response);
}
async function savePath(value) {
  await app.evaluate((_, value) => globalThis.savePaths.push(value), value);
}
async function status() {
  return page.evaluate(() => window.freacDocument.status());
}
async function draw() {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("Escape");
}
try {
  await launch();
  assert.equal((await status()).name, "Untitled");
  await menu("Open…");
  const documents = await app.evaluate(({ app }) => app.getPath("documents"));
  assert.deepEqual(
    await app.evaluate(() => globalThis.dialogDefaults.at(-1)),
    { kind: "open", path: documents },
    "First Open starts in Documents",
  );
  await menu("Save");
  assert.deepEqual(
    await app.evaluate(() => globalThis.dialogDefaults.at(-1)),
    { kind: "save", path: join(documents, "Untitled.freac") },
    "First Save starts in Documents",
  );
  await draw();
  assert.equal((await status()).edited, true);
  const original = (await inspect(page)).document;
  await answer(1);
  await page.keyboard.press("Meta+n");
  await page.waitForTimeout(120);
  await settled(page);
  assert.deepEqual((await inspect(page)).document, original, "Cancel New preserves geometry");
  await answer(0);
  await menu("New");
  assert.deepEqual((await inspect(page)).document, original, "Cancelled Save preserves geometry");
  await savePath(path);
  await page.keyboard.press("Meta+s");
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Current document"]').textContent.includes("Edited"),
  );
  await settled(page);
  assert.equal((await status()).path, path);
  assert.equal((await status()).edited, false);
  assert.equal(JSON.parse(await readFile(path, "utf8")).document.sketches.length, 1);
  await menu("Undo", "Edit");
  await settled(page);
  assert.equal((await status()).edited, true);
  await page.keyboard.press("Meta+Shift+z");
  await settled(page);
  assert.equal((await status()).edited, false, "Redo to saved contents clears edited state");
  await savePath(join(root, "missing", "Failed.freac"));
  await menu("Save As…");
  assert.equal((await status()).path, path, "Failed Save As retains original identity");
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).document.sketches, original.sketches);
  const broken = join(root, "Broken.freac");
  await writeFile(broken, '{"format":"freac","version":1,"document":{"units":"bad"}}');
  await app.evaluate((_, path) => globalThis.openPaths.push(path), broken);
  await menu("Open…");
  assert.deepEqual((await inspect(page)).document, original, "Failed Open retains geometry");
  assert.equal((await status()).path, path);
  const copyPath = join(root, "Copy.freac");
  await savePath(copyPath);
  await page.keyboard.press("Meta+Shift+s");
  await page.waitForTimeout(120);
  await settled(page);
  assert.equal((await status()).path, copyPath, "Save As changes current file identity");
  assert.equal((await status()).edited, false);
  await page.keyboard.press("Meta+n");
  await page.waitForTimeout(120);
  await settled(page);
  assert.equal((await inspect(page)).document.sketches.length, 0);
  assert.equal((await status()).path, null);
  await app.evaluate((_, path) => globalThis.openPaths.push(path), path);
  await page.keyboard.press("Meta+o");
  await page.waitForTimeout(120);
  await settled(page);
  assert.equal((await inspect(page)).document.sketches.length, 1);
  await app.close();
  await launch();
  assert.equal((await status()).path, path, "Relaunch restores current file identity");
  assert.equal((await inspect(page)).document.sketches.length, 1);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [30, 0], [40, 10]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+s");
  await page.waitForTimeout(120);
  await settled(page);
  assert.equal((await status()).edited, false);
  assert.equal(
    JSON.parse(await readFile(path, "utf8")).document.sketches[0].curves.length,
    2,
    "Save writes back to the current file without another picker",
  );
  await page.keyboard.press("Meta+z");
  await settled(page);
  await answer(1);
  await menu("Close");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 1);
  await answer(1);
  await app.evaluate(({ app }) => app.quit());
  await page.waitForTimeout(120);
  assert.equal((await status()).edited, true, "Cancel Quit leaves window and edits alive");
  await answer(2);
  await menu("New");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await app.close();
  await launch();
  assert.equal((await status()).path, null, "New clears remembered file");
  await menu("Open…");
  assert.deepEqual(
    await app.evaluate(() => globalThis.dialogDefaults.at(-1)),
    { kind: "open", path: root },
    "New and relaunch preserve the last document folder",
  );
  await menu("Save");
  assert.deepEqual(
    await app.evaluate(() => globalThis.dialogDefaults.at(-1)),
    { kind: "save", path: join(root, "Untitled.freac") },
    "Untitled Save uses remembered folder",
  );
  await app.evaluate((_, path) => globalThis.openPaths.push(path), path);
  await menu("Open…");
  const closed = page.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "New")
      .click(),
  );
  page = await app.firstWindow();
  await settled(page);
  await page.waitForFunction(async () => (await window.freacDocument.status()).path === null);
  assert.equal((await status()).path, null, "New works with no open macOS window");
  await draw();
  const savedOnNew = join(root, "Saved-on-new.freac");
  await savePath(savedOnNew);
  await answer(0);
  await menu("New");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  assert.equal(
    JSON.parse(await readFile(savedOnNew, "utf8")).document.sketches.length,
    1,
    "Save from the replacement prompt completes before New",
  );
  await app.evaluate((_, path) => globalThis.openPaths.push(path), savedOnNew);
  await menu("Open…");
  await app.close();
  await rm(savedOnNew);
  await launch();
  await page.getByRole("status").filter({ hasText: "Could not reopen" }).waitFor();
  assert.equal((await status()).path, null);
  assert.equal(
    (await inspect(page)).document.sketches.length,
    0,
    "A missing remembered file starts empty and reports the failure",
  );
  console.log(
    "Hidden Electron: native menus, real drawing, save identity, dirty Undo/Redo, cancellation, failed open/save, close/quit protection and process restoration pass",
  );
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
