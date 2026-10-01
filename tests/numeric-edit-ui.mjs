import assert from "node:assert/strict";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { numericOwnership } from "./ui-interaction-lifecycle.mjs";
import { moveFieldsRoute } from "./ui-move-fields.mjs";
import { numericSketch } from "./ui-option-move.mjs";
import { numericDuringDrag } from "./ui-rectangle.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function blurAndReload(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const original = (await inspect(page)).document;
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("28");
  await width.blur();
  const changed = (await inspect(page)).document;
  assert.notDeepEqual(changed, original);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await click(page, 0, 0);
  await width.fill("31");
  await page.reload();
  assert.deepEqual((await inspect(page)).document, original, "reload discards uncommitted text");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await click(page, 0, 0);
  await width.fill("25");
  await page.keyboard.press("Enter");
  assert.notDeepEqual((await inspect(page)).document, original, "new composition accepts input");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}

await withUiRuntimes(
  async (page, name) => {
    await numericOwnership(page);
    await numericDuringDrag(page);
    await moveFieldsRoute(page, name);
    await numericSketch(page);
    await blurAndReload(page);
    console.log(
      `${name}: numeric blur/Enter/Escape, Tab/Shift-Tab, held-drag values, Option copy and reload pass`,
    );
  },
  { timeout: 20000 },
);
