import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await plate(page);
  await clearSelection(page);
  const before = (await inspect(page)).document;
  const swatch = page.getByRole("button", { name: "Color for Body 1", exact: true });
  await swatch.click();
  await page.getByLabel("Color", { exact: true }).fill("#dd4422");
  await page.getByLabel("Opacity (%)").fill("35");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.mouse.move(1100, 750);
  let state = await inspect(page);
  const appearance = [{ body: before.bodies[0].id, color: "#dd4422", alpha: 0.35 }];
  assert.deepEqual(state.document.bodyAppearances, appearance);
  assert.deepEqual(state.document.bodies, before.bodies);
  assert.ok(
    state.bodyRendering.faces.every(
      (face) =>
        face.color === "dd4422" && face.opacity === 0.35 && face.transparent && !face.depthWrite,
    ),
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-body-color.png` });
  await swatch.click();
  await page.getByLabel("Opacity (%)").fill("0");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodyAppearances, undefined);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  for (const opacity of [0, 100, 35]) {
    await swatch.click();
    await page.getByLabel("Opacity (%)").fill(String(opacity));
    await page.keyboard.press("Enter");
    state = await inspect(page);
    assert.ok(
      state.bodyRendering.faces.every(
        (face) => face.opacity === opacity / 100 && face.transparent === opacity < 100,
      ),
    );
  }
  const directory = await mkdtemp(join(tmpdir(), "freac-colors-"));
  try {
    const path = join(directory, "color.freac");
    await saveDocument(page, path);
    await openDocument(page, path);
    assert.deepEqual((await inspect(page)).document.bodyAppearances, appearance);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(
    `${name}: body color, alpha endpoints, Cancel, keyboard Apply, Undo/Redo and Save/Open passed`,
  );
});
