import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-archive-size-"));
const original = join(root, "Original.freac"),
  copy = join(root, "Copy.freac");
let app;
try {
  app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await settled(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [2, 2], [12, 8]);
  await page.keyboard.press("Escape");
  await saveDocument(page, original);
  const before = await readFile(original);
  console.log("electron: saved ordinary pointer-created sketch");
  // Padding exercises the actual byte boundary without manufacturing millions of curves.
  await page.evaluate(async () => {
    const sketch = window.freacInspect().document.sketches[0];
    const reply = await window.freacModel({
      kind: "edit",
      sketch: { ...sketch, padding: "x".repeat(64 * 1024 * 1024) },
    });
    if (reply.error) throw new Error(reply.error);
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, copy);
  const result = await page.evaluate(async () => {
    const errors = [];
    for (const command of ["save", "save-as"])
      errors.push((await window.freacDocument.command(command)).error);
    return { errors, status: await window.freacDocument.status() };
  });
  assert.ok(
    result.errors.every((error) => /64 MiB/.test(error)),
    JSON.stringify(result.errors),
  );
  assert.equal(result.status.path, original, "failed Save As retains file identity");
  assert.equal(result.status.edited, true, "failed Save retains the unsaved baseline");
  assert.deepEqual(await readFile(original), before, "failed Save preserves destination bytes");
  await assert.rejects(readFile(copy), { code: "ENOENT" });
  console.log(
    "electron: oversized model-only Save/Save As preserves destination, path and Edited state",
  );
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
