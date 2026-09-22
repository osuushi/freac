import assert from "node:assert/strict";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function hover(page, point, kind) {
  const before = await inspect(page),
    p = await at(page, ...point);
  await page.mouse.move(p.x, p.y);
  const after = await inspect(page);
  assert.equal(after.hover?.kind, kind);
  assert.deepEqual(after.selection, before.selection, "Hover never changes selection");
  assert.equal(after.selectedPoint, before.selectedPoint);
  if (kind !== "curve") assert.equal(await page.locator(".hover-point").count(), 1);
  return after;
}
async function joinedLines(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("l");
  await drag(page, [-20, -10], [-10, -10]);
  const original = (await inspect(page)).document.sketches[0].curves[0];
  assert.equal((await inspect(page)).selectedPoint, null);
  await hover(page, [-10.2, -9.8], "endpoint");
  await page.mouse.down();
  assert.equal((await inspect(page)).selectedPoint, null, "A press is not point selection");
  const end = await at(page, -10, 0);
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  let state = await inspect(page),
    curves = state.document.sketches[0].curves;
  assert.equal(curves.length, 2);
  assert.deepEqual(curves[0], original, "Drawing from an endpoint leaves its curve alone");
  pointEquals(curves[1].a, [-10, -10]);
  pointEquals(curves[1].b, [-10, 0]);
  await drag(page, [-10, 0], [-20, -10]);
  curves = (await inspect(page)).document.sketches[0].curves;
  assert.equal(curves.length, 3);
  pointEquals(curves[2].a, [-10, 0]);
  pointEquals(curves[2].b, [-20, -10]);
  // The endpoint of a different, unselected curve is also independently selectable.
  const target = await at(page, -10, -10);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  assert.equal((await inspect(page)).selectedPoint, null);
  await page.mouse.up();
  state = await inspect(page);
  assert.equal(state.selectedPoint, `${original.id}/b`);
  assert.equal((await inspect(page)).tool, "select");
  assert.equal(await page.locator(".selected-point").count(), 1);
  await drag(page, [-10, -10], [-7, -12]);
  curves = (await inspect(page)).document.sketches[0].curves;
  assert.equal(curves.length, 3);
  pointEquals(curves[0].b, [-7, -12]);
  pointEquals(curves[1].a, [-7, -12]);
  assert.equal(
    state.document.sketches[0].constraints.length,
    3,
    "The triangle closes with three drawing attachments; selection/drag adds no links",
  );
  await page.keyboard.press("Control+z");
  pointEquals((await inspect(page)).document.sketches[0].curves[0].b, [-10, -10]);
  assert.equal((await inspect(page)).selectedPoint, null, "Undo clears stale point selection");
  // Select needs no preliminary click, even after Undo has cleared selection.
  await drag(page, [-10, -10], [-8, -13]);
  curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[0].b, [-8, -13]);
  pointEquals(curves[1].a, [-8, -13]);
  pointEquals(curves[2].a, [-10, 0]);
  await page.keyboard.press("Control+z");
  pointEquals((await inspect(page)).document.sketches[0].curves[1].a, [-10, -10]);
}
async function geometryAndGrid(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("l");
  const center = await hover(page, [10.2, 5.2], "center");
  assert.equal(center.snap.label, "Center");
  await drag(page, [10.2, 5.2], [14, 16]);
  let curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[4].a, [10, 5]);
  await hover(page, [3.2, 0.2], "curve");
  await drag(page, [3.2, 0.2], [3, -10]);
  curves = (await inspect(page)).document.sketches[0].curves;
  close(curves[5].a.y, 0, "A new line starts on the edge projection");
  assert.ok(Math.abs(curves[5].a.x - 3.2) < 0.1, "Edge snap does not quantize along the edge");
  // Grid off exposes geometry-only attraction; Shift then bypasses that attraction.
  await chooseTool(page, "grid snap", "grid");
  await hover(page, [20.3, 10.3], "handle");
  await drag(page, [20.3, 10.3], [26, 17], ["Shift"]);
  curves = (await inspect(page)).document.sketches[0].curves;
  assert.ok(curves[6].a.x > 20.1 && curves[6].a.y > 10.1);
  await chooseTool(page, "grid snap", "grid");
  await drag(page, [-30.3, 10.3], [-25.3, 15.3], ["Shift"]);
  curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[7].a, [-30, 10]);
  pointEquals(curves[7].b, [-25, 15]);
  assert.equal(String((await inspect(page)).gridSnap), "true");
  await page.keyboard.press("v");
  await click(page, 17, 7);
  await hover(page, [10, 5], "center");
  await click(page, 10, 5);
  await drag(page, [10, 5], [12, 7]);
  curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[0].a, [2, 2]);
  pointEquals(curves[4].a, [12, 7]);
  pointEquals(curves[4].b, [14, 16]);
}
export async function pointIntentRoute(page, name) {
  await joinedLines(page);
  await geometryAndGrid(page);
  await sharedCorners(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-point-intent.png` });
  console.log(
    `${name}: click-selected points, joined drags, hover guidance, edge/center starts and independent grid/Shift snapping passed`,
  );
}

async function sharedCorners(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [10, 10]);
  await page.keyboard.press("r");
  await drag(page, [0, 0], [-10, -10]);
  const original = (await inspect(page)).document;
  await page.keyboard.press("v");
  await drag(page, [0, 0], [2, 3]);
  const curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[0].a, [2, 3]);
  pointEquals(curves[4].a, [2, 3]);
  pointEquals(curves[2].a, [10, 10]);
  pointEquals(curves[6].a, [-10, -10]);
  await page.keyboard.press("Control+z");
  assert.deepEqual((await inspect(page)).document, original);
}
