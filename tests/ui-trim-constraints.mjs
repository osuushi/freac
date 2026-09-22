import assert from "node:assert/strict";
import { pixels, tinted } from "./ui-fill.mjs";
import { click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
export async function trimConstraintRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("l");
  await drag(page, [-10, 0], [10, 0]);
  await page.getByRole("button", { name: "Lock Length", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [-4, -6], [-4, 6]);
  await page.keyboard.press("l");
  await drag(page, [4, -6], [4, 6]);
  const original = await data(page);
  await page.keyboard.press("t");
  await click(page, 0, 0);
  await inspect(page);
  assert.equal(await page.getByRole("button", { name: "Remove and trim" }).count(), 0);
  assert.match(await page.getByRole("status").textContent(), /constraint.*removed.*Undo/);
  let sketch = await data(page);
  assert.equal(sketch.curves.length, 4);
  assert.equal(sketch.constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), original);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  const samples = [[4.3, 4.3]],
    blank = await pixels(page, samples);
  await drag(page, [0, 0], [10, 10]);
  const rectangle = await data(page);
  tinted(blank[0], (await pixels(page, samples))[0]);
  await page.keyboard.press("t");
  await click(page, 5, 0);
  await inspect(page);
  sketch = await data(page);
  assert.equal(sketch.curves.length, 3);
  assert.equal(sketch.groups.length, 0);
  assert.deepEqual(
    (await pixels(page, samples))[0],
    blank[0],
    "Opening the boundary removes its fill",
  );
  assert.ok(sketch.constraints.some((c) => c.kind === "perpendicular"));
  await page.keyboard.press("v");
  await click(page, 10, 6);
  await page.getByRole("button", { name: "Remove Perpendicular constraint", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-trim-rectangle.png` });
  await drag(page, [10, 0], [12, 0], ["Shift"]);
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [12, 0]);
  pointEquals(sketch.curves[0].b, [10, 10]);
  const [a, b] = sketch.curves;
  const u = { x: a.b.x - a.a.x, y: a.b.y - a.a.y },
    v = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
  assert.ok(Math.abs(u.x * v.x + u.y * v.y) < 1e-6, "Surviving corner remains perpendicular");
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), rectangle);
  console.log(
    `${name}: Trim automatic constraint removal/Undo, rectangle-to-constraints and surviving right-angle editing passed`,
  );
}
