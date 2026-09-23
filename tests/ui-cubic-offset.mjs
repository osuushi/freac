import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cubicOffsetRoute(page, name) {
  const sketch = JSON.parse(await readFile("tests/fixtures/offset-cubic-section.json", "utf8"));
  await inspect(page);
  await openDocument(page, {
    name: "cubic-section.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "freac",
        version: 1,
        document: { units: "mm", sketches: [sketch] },
      }),
    ),
  });
  await inspect(page);
  await page.getByRole("button", { name: "Sketch on XZ", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("Meta+a");
  assert.equal((await inspect(page)).selection.length, sketch.curves.length);
  await chooseTool(page, "offset sketch curves", "sketch-offset");
  const input = page.getByRole("textbox", { name: "Offset distance", exact: true });
  await input.fill("-1");
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document.sketches[0], sketch);
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Offset distance"]')?.getAttribute("aria-invalid") ===
      "true",
  );
  await input.fill("-0.2");
  await page.keyboard.press("Enter");
  const inward = (await inspect(page)).document.sketches[0];
  assert.ok(inward.curves.length > sketch.curves.length);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], sketch);
  await page.keyboard.press("Meta+a");
  await chooseTool(page, "offset sketch curves", "sketch-offset");
  await input.fill("1");
  await page.keyboard.press("Enter");
  const copied = (await inspect(page)).document.sketches[0];
  const added = copied.curves.slice(sketch.curves.length);
  assert.ok(added.some((c) => c.kind === "bezier"));
  assert.equal((await inspect(page)).selection.length, added.length);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cubic-offset.png` });
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], sketch);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.sketches[0], copied);
  await cubicOffsetGestures(page, copied);
  // Reselect and drag a joined copied cubic endpoint, with geometry snapping bypassed.
  await page.keyboard.press("v");
  const curve = added.find((c) => c.kind === "bezier");
  const point = await at(page, curve.b.x, curve.b.y);
  await page.mouse.click(point.x, point.y);
  await drag(page, [curve.b.x, curve.b.y], [curve.b.x + 2, curve.b.y - 2], ["Shift"]);
  const moved = (await inspect(page)).document.sketches[0];
  assert.deepEqual(moved.curves.slice(0, sketch.curves.length), sketch.curves);
  assert.notDeepEqual(moved.curves.slice(sketch.curves.length), added);
  const path = resolve(`.cache/sketch-review/${name}-cubic-offset.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  assert.deepEqual((await inspect(page)).document.sketches[0], moved);
  console.log(
    `${name}: cubic offset menu, inward/outward, rejection, Undo/Redo, joined-point editing and Save/Open passed`,
  );
}

async function cubicOffsetGestures(page, copied) {
  await chooseTool(page, "offset sketch curves", "sketch-offset");
  await page.getByRole("textbox", { name: "Offset distance" }).fill("0.5");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.sketches[0], copied);
  await chooseTool(page, "toggle grid snapping", "grid");
  const box = await page.getByRole("button", { name: "Offset loop", exact: true }).boundingBox();
  const origin = await at(page, 0, 0),
    shifted = await at(page, 0, -0.5);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + shifted.x - origin.x, y + shifted.y - origin.y, { steps: 8 });
  await page.mouse.up();
  assert.ok((await inspect(page)).document.sketches[0].curves.length > copied.curves.length);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], copied);
}
