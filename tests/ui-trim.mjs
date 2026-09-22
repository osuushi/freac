import assert from "node:assert/strict";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
async function line(page, a, b) {
  await page.keyboard.press("l");
  await drag(page, a, b);
}
export async function trimLineRoute(page, name) {
  await reset(page);
  await page.keyboard.press("t");
  assert.equal((await inspect(page)).activePlane, null);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await line(page, [-10, 0], [10, 0]);
  await line(page, [-4, -6], [-4, 6]);
  await line(page, [4, -6], [4, 6]);
  const original = await data(page),
    source = original.curves[0];
  await page.keyboard.press("t");
  const p = await at(page, 0, 0);
  await page.mouse.move(p.x, p.y);
  assert.equal(await page.locator(".trim-span").getAttribute("data-curve"), source.id);
  const expected = [await at(page, -4, 0), await at(page, 4, 0)];
  const points = (await page.locator(".trim-span").getAttribute("points"))
    .split(" ")
    .map((p) => p.split(",").map(Number));
  for (let i = 0; i < 2; i++) {
    close(points[i][0], expected[i].x);
    close(points[i][1], expected[i].y);
  }
  await page.screenshot({ path: `.cache/sketch-review/${name}-trim-span.png` });
  await click(page, 0, 0);
  let sketch = await data(page);
  assert.equal(sketch.curves.length, 4);
  pointEquals(sketch.curves[0].a, [-10, 0]);
  pointEquals(sketch.curves[0].b, [-4, 0]);
  pointEquals(sketch.curves[1].a, [4, 0]);
  pointEquals(sketch.curves[1].b, [10, 0]);
  assert.equal(sketch.constraints.length, 0, "Trim does not fuse to its cutters");
  assert.equal((await inspect(page)).tool, "trim");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), original);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await page.keyboard.press("v");
  await drag(page, [-10, 0], [-12, 2], ["Shift"]);
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [-12, 2]);
  pointEquals(sketch.curves[2].a, [-4, -6]);
  console.log(
    `${name}: Trim plane/shortcut, exact hover span, independent remnants, retained tool and Undo/Redo passed`,
  );
}
export async function trimCircleRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  await line(page, [-10, 0], [10, 0]);
  await chooseTool(page, "trim", "trim");
  await click(page, 0, 6);
  let sketch = await data(page);
  const arc = sketch.curves[0];
  assert.equal(arc.kind, "arc");
  pointEquals(arc.a, [-6, 0]);
  pointEquals(arc.b, [6, 0]);
  close(arc.bulge, 1);
  await page.keyboard.press("v");
  await click(page, 0, -6);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("8");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  assert.equal(sketch.curves[0].kind, "arc");
  await page.keyboard.press("t");
  // Select the actual remaining arc rather than a point on its supporting circle.
  const current = sketch.curves[0];
  const r = 8,
    centerY = ((1 - current.bulge ** 2) * (current.b.x - current.a.x)) / (4 * current.bulge);
  await click(page, 0, centerY - r);
  sketch = await data(page);
  assert.equal(sketch.curves.length, 1);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  await line(page, [-10, 6], [10, 6]);
  await page.keyboard.press("t");
  await click(page, 0, -6);
  sketch = await data(page);
  assert.equal(sketch.curves.length, 1);
  assert.equal(sketch.curves[0].kind, "segment");
  console.log(
    `${name}: circle-to-arc trim, editable radius, bounded arc deletion and tangent-only whole-circle deletion passed`,
  );
}
