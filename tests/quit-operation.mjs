import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-quit-operation-"));
const file = join(root, "Committed.freac");
const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
try {
  const page = await app.firstWindow();
  await settled(page);
  await app.evaluate(({ dialog }, file) => {
    globalThis.prompts = 0;
    globalThis.answer = 1;
    dialog.showMessageBox = async () => {
      globalThis.prompts++;
      return { response: globalThis.answer };
    };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  assert.equal((await inspect(page)).preview.bodies[0].volume, 3000);
  await app.evaluate(({ app }) => app.quit());
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  await settled(page);
  assert.equal(await app.evaluate(() => globalThis.prompts), 1);
  assert.equal((await inspect(page)).preview, null);
  assert.equal((await inspect(page)).document.bodies[0].volume, 3000);
  await page.keyboard.press("Meta+z");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await page.keyboard.press("Meta+Shift+z");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies[0].volume, 3000);
  await app.evaluate(() => {
    globalThis.answer = 0;
  });
  const closed = page.waitForEvent("close");
  await page.keyboard.press("Meta+w");
  await closed;
  assert.equal(JSON.parse(await readFile(file, "utf8")).document.bodies.length, 1);
  const opening = app.waitForEvent("window");
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "New")
      .click();
  });
  const reopened = await opening;
  await settled(reopened);
  await reopened.waitForFunction(async () => (await window.freacDocument.status()).path === null);
  await settled(reopened);
  await app.evaluate(({ dialog, Menu }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Open…")
      .click();
  }, file);
  await reopened.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  await settled(reopened);
  assert.equal((await inspect(reopened)).document.bodies[0].volume, 3000);
  console.log(
    "PASS hidden Electron: Quit accepts extrusion before Cancel prompt; Undo/Redo and close/save/reopen preserve geometry",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close();
  await rm(root, { recursive: true, force: true });
}
