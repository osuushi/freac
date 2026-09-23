import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
async function pair(page, a, b) {
  await page.keyboard.press("v");
  await click(page, ...a);
  await page.keyboard.down("Shift");
  await click(page, ...b);
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Constrain concentric", exact: true }).click();
  await inspect(page);
}
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function concentricRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [8, 0], [12, 0]);
  await drag(page, [-10, 0], [-8, 0]);
  const original = await data(page);
  await pair(page, [-12, 0], [8, 4]);
  let sketch = await data(page);
  assert.deepEqual(sketch.curves[0], original.curves[0]);
  pointEquals(sketch.curves[1].center, [8, 0]);
  close(sketch.curves[1].radius, 2);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.deepEqual(await data(page), original);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await click(page, 20, 15);
  await click(page, 6, 0);
  await radius(page, 3);
  sketch = await data(page);
  close(sketch.curves[0].radius, 4);
  close(sketch.curves[1].radius, 3);
  const remove = page.getByRole("button", { name: "Remove Concentric constraint", exact: true });
  await remove.hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-concentric.png` });
  await remove.click();
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 8, 0);
  await drag(page, [8, 0], [10, 3], ["Shift"]);
  for (const curve of (await data(page)).curves) pointEquals(curve.center, [10, 3]);
  await startArc(page, 8);
  await page.keyboard.press("c");
  await drag(page, [12, -5], [14, -5]);
  const before = await data(page);
  await pair(page, [-5, 3], [12, -7]);
  sketch = await data(page);
  assert.deepEqual(sketch.curves[1], before.curves[1]);
  pointEquals(sketch.curves[0].a, [8, -8]);
  pointEquals(sketch.curves[0].b, [16, -8]);
  close(sketch.curves[0].bulge, -2);
  await click(page, 20, 15);
  await click(page, 7, -5);
  await radius(page, 6);
  sketch = await data(page);
  pointEquals(sketch.curves[1].center, [12, -8 + Math.sqrt(20)]);
  close(sketch.curves[1].radius, 2);
  await concentricArcs(page);
  console.log(
    `${name}: Concentric circle/arc pairs, first-subject movement, independent radii, later movement and removal/Undo passed`,
  );
}

export async function concentricArcs(page) {
  await startArc(page, 8);
  await page.keyboard.press("l");
  await drag(page, [10, -5], [14, -5]);
  const box = await page.locator(".bow-handle").nth(1).boundingBox();
  const to = await at(page, 12, -4);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  const before = await data(page);
  await pair(page, [-5, 3], [11, -6.5 + Math.sqrt(5.25)]);
  const linked = await data(page);
  assert.deepEqual(linked.curves[1], before.curves[1]);
  pointEquals(linked.curves[0].a, [8, -9.5]);
  pointEquals(linked.curves[0].b, [16, -9.5]);
  await click(page, 20, 15);
  await click(page, 7, -6.5);
  await radius(page, 6);
  const result = await data(page);
  close(result.curves[1].bulge, before.curves[1].bulge);
  const rise = Math.sqrt(20) - 3;
  pointEquals(result.curves[1].a, [10, -5 + rise]);
  pointEquals(result.curves[1].b, [14, -5 + rise]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.deepEqual(await data(page), linked);
}
