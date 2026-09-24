import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
export async function coincidenceRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [3, 5], [8, 5]);
  await drag(page, [-10, 0], [-5, 0]);
  const source = await data(page);
  await page.keyboard.press("v");
  await click(page, source.curves[1].b.x, source.curves[1].b.y);
  await page.keyboard.down("Shift");
  await click(page, source.curves[0].a.x, source.curves[0].a.y);
  await page.keyboard.up("Shift");
  const action = page.getByRole("button", { name: "Make points coincident", exact: true });
  assert.ok(
    await action.evaluate((b) => b.scrollWidth <= b.clientWidth),
    "Coincident label must not be clipped",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-coincidence-action.png` });
  const original = await data(page);
  assert.equal(original.constraints.length, 0);
  await page.getByRole("button", { name: "Make points coincident", exact: true }).click();
  const result = await data(page);
  assert.equal(result.constraints.length, 1);
  assert.deepEqual(result.curves[0], original.curves[0]);
  pointEquals(result.curves[1].a, [source.curves[1].a.x, source.curves[1].a.y]);
  pointEquals(result.curves[1].b, [source.curves[0].a.x, source.curves[0].a.y]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-coincidence.png` });
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.deepEqual(await data(page), original);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  pointEquals((await data(page)).curves[1].b, [source.curves[0].a.x, source.curves[0].a.y]);
  await startArc(page, 2);
  await page.keyboard.press("c");
  await drag(page, [-10, 8], [-8, 8]);
  await page.keyboard.press("v");
  await click(page, -10, 8);
  await page.keyboard.down("Shift");
  await click(page, 4, 0);
  await page.keyboard.up("Shift");
  const curved = await data(page);
  await page.getByRole("button", { name: "Make points coincident", exact: true }).click();
  const joined = await data(page);
  assert.deepEqual(joined.curves[0], curved.curves[0]);
  pointEquals(joined.curves[1].center, [4, 0]);
  assert.equal(joined.curves[1].radius, 2);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, -10, 8);
  await page.keyboard.down("Shift");
  await click(page, 4, 0);
  await page.keyboard.up("Shift");
  // Reverse selection through the diagrams: diagram order must not define roles.
  await page.getByRole("button", { name: "Point 2", exact: true }).click();
  await page.keyboard.down("Shift");
  await page.getByRole("button", { name: "Point 1", exact: true }).click();
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Make points coincident", exact: true }).click();
  const reversed = await data(page);
  assert.deepEqual(reversed.curves[1], curved.curves[1]);
  pointEquals(reversed.curves[0].a, [-4, 0]);
  pointEquals(reversed.curves[0].b, [-10, 8]);
  console.log(
    `${name}: separated point Shift-selection, first-point coincidence, fixed reference and Undo/Redo passed`,
  );
}
