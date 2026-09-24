import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
async function tangent(page, reference) {
  const point = await at(page, ...reference);
  assert.equal(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("button,input"),
      point,
    ),
    false,
    "Reference selection must hit geometry, not a local control",
  );
  await page.keyboard.down("Shift");
  await click(page, ...reference);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 2);
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  await inspect(page);
}
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function tangencyRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [2, 0]);
  await page.keyboard.press("l");
  await drag(page, [-8, 6], [8, 6]);
  await page.keyboard.press("v");
  const original = await data(page);
  await tangent(page, [0, -2]);
  let sketch = await data(page);
  assert.equal(sketch.constraints[0].kind, "tangent");
  assert.deepEqual(sketch.curves[0], original.curves[0]);
  pointEquals(sketch.curves[1].a, [-8, 2]);
  pointEquals(sketch.curves[1].b, [8, 2]);
  await click(page, 20, 15);
  await click(page, -2, 0);
  await radius(page, 4);
  sketch = await data(page);
  close(sketch.curves[1].a.y, 4);
  close(sketch.curves[1].b.y, 4);
  await click(page, 20, 15);
  await click(page, 0, 4);
  await drag(page, [0, 4], [0, 6], ["Shift"]);
  sketch = await data(page);
  pointEquals(sketch.curves[0].center, [0, 2]);
  close(sketch.curves[0].radius, 4);
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-tangent.png` });
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).click();
  assert.equal((await data(page)).constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), sketch);
  await startArc(page, 8);
  await page.keyboard.press("l");
  await drag(page, [-8, 11], [8, 11]);
  await page.keyboard.press("v");
  await tangent(page, [4.8, 1.6]);
  sketch = await data(page);
  close(sketch.curves[1].a.y, 8);
  close(sketch.curves[1].b.y, 8);
  await click(page, 20, 15);
  await click(page, -5, 3);
  await radius(page, 6);
  sketch = await data(page);
  close(sketch.curves[1].a.y, Math.sqrt(20) + 6);
  close(sketch.curves[1].b.y, Math.sqrt(20) + 6);
  pointEquals(sketch.curves[0].a, [-4, 0]);
  pointEquals(sketch.curves[0].b, [4, 0]);
  console.log(
    `${name}: line/circle and line/arc Tangent, radius edits, line drag and removal/Undo passed`,
  );
}
