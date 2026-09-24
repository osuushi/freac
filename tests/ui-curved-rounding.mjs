import assert from "node:assert/strict";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function bowSelected(page, radius) {
  await page.keyboard.press("v");
  const guide = page.locator(".bow-handle").first();
  await guide.waitFor({ state: "visible" });
  const handle = await guide.boundingBox();
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(radius));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function curvedRoundingRoute(page, name) {
  for (const both of [false, true]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("l");
    await drag(page, [0, 0], [20, 0]);
    if (both) await bowSelected(page, 30);
    await page.keyboard.press("l");
    await drag(page, [0, 0], [0, 15]);
    await bowSelected(page, 25);
    await page.keyboard.press("v");
    await click(page, 0, 0);
    const before = (await inspect(page)).document;
    await chooseTool(page, "fillet sketch", "sketch-fillet");
    await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
    await page.keyboard.press("Enter");
    let sketch = (await inspect(page)).document.sketches[0];
    assert.equal(sketch.curves.length, 3, await page.getByRole("status").textContent());
    assert.equal(sketch.constraints.filter((c) => c.kind === "tangent").length, 2);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
    await page.keyboard.press("Enter");
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await click(page, 0, 0);
    const from = await filletGuidePoint(page),
      to = await at(page, 25, 25);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 15 });
    await page.mouse.up();
    sketch = (await inspect(page)).document.sketches[0];
    assert.equal(sketch.curves.length, 1, await page.getByRole("status").textContent());
    assert.deepEqual(sketch.curves[0].a, before.sketches[0].curves[0].b);
    assert.deepEqual(sketch.curves[0].b, before.sketches[0].curves[1].b);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(
    `${name}: line/arc and arc/arc guide, typed radius/edit, drag consumes both and Undo passed`,
  );
}
