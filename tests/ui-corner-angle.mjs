import assert from "node:assert/strict";
import { click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
async function number(page, value) {
  await page.getByRole("textbox", { name: "Corner angle", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function cornerAngleRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 10], [0, 0], ["Shift"]); // Angle edits must not create links.
  await page.keyboard.press("v");
  await click(page, 0, 7);
  await page.keyboard.down("Shift");
  await click(page, 7, 0);
  await page.keyboard.up("Shift");
  close(
    Number(await page.getByRole("textbox", { name: "Corner angle", exact: true }).inputValue()),
    90,
  );
  const reference = (await data(page)).curves[0];
  await number(page, 60);
  let sketch = await data(page);
  assert.equal(sketch.constraints.length, 0, "Typing does not lock or fuse");
  assert.deepEqual(sketch.curves[0], reference);
  pointEquals(sketch.curves[1].b, [0, 0]);
  pointEquals(sketch.curves[1].a, [5, Math.sqrt(75)]);
  await page.getByRole("button", { name: "Lock Corner angle", exact: true }).click();
  await inspect(page);
  sketch = await data(page);
  assert.equal(sketch.constraints.length, 1);
  assert.equal(sketch.constraints[0].kind, "corner-angle");
  await number(page, 30);
  sketch = await data(page);
  close(Math.abs(sketch.constraints[0].value), 30);
  pointEquals(sketch.curves[1].a, [Math.sqrt(75), 5]);
  const saved = sketch;
  await number(page, 181);
  assert.deepEqual(await data(page), saved);
  await page.keyboard.press("Escape");
  await click(page, 20, 15);
  await click(page, 6, 3.464101615);
  const remove = page.getByRole("button", { name: "Remove Angle 30° constraint", exact: true });
  await remove.hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-corner-angle.png` });
  await remove.click();
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 1);
  console.log(
    `${name}: local meeting-edge angle, one-time edit, explicit lock/edit, fixed reference, invalid value and removal/Undo passed`,
  );
}
