import assert from "node:assert/strict";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function trimShiftRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const [a, b] of [
    [
      [-10, 0],
      [10, 0],
    ],
    [
      [-4, 0],
      [4, 0],
    ],
    [
      [-6, -6],
      [-6, 6],
    ],
    [
      [6, 0],
      [6, 6],
    ],
  ]) {
    await page.keyboard.press("l");
    await drag(page, a, b, ["Shift"]);
  }
  const original = (await inspect(page)).document;
  await page.keyboard.press("t");
  const p = await at(page, 5, 0);
  await page.mouse.move(p.x, p.y);
  async function highlight(left, right) {
    const points = (await page.locator(".trim-span").getAttribute("points"))
      .split(" ")
      .map((p) => p.split(",").map(Number));
    const expected = [await at(page, left, 0), await at(page, right, 0)];
    assert.equal(points.length, 2);
    for (let i = 0; i < 2; i++) {
      close(points[i][0], expected[i].x);
      close(points[i][1], expected[i].y);
    }
  }
  await highlight(4, 6);
  await page.keyboard.down("Shift");
  await highlight(-6, 6);
  await page.keyboard.up("Shift");
  await highlight(4, 6);
  await page.keyboard.down("Shift");
  await highlight(-6, 6);
  await click(page, 5, 0);
  await page.keyboard.up("Shift");
  const after = (await inspect(page)).document;
  const curves = after.sketches[0].curves;
  assert.equal(curves.length, 4);
  pointEquals(curves[0].a, [-10, 0]);
  pointEquals(curves[0].b, [-6, 0]);
  pointEquals(curves[1].a, [6, 0]);
  pointEquals(curves[1].b, [10, 0]);
  assert.deepEqual(curves.slice(2), original.sketches[0].curves.slice(2));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  console.log(
    `${name}: Shift trim skips overlap endpoints, keeps crossing/T contacts, updates stationary hover and accepts one Undo passed`,
  );
}
