import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function trimOverlapRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const [a, b] of [
    [
      [-10, 0],
      [10, 0],
    ],
    [
      [4, 0],
      [-4, 0],
    ],
    [
      [-4, 0],
      [4, 0],
    ],
    [
      [0, -8],
      [0, 8],
    ],
  ]) {
    await page.keyboard.press("l");
    await drag(page, a, b, ["Shift"]);
  }
  const original = (await inspect(page)).document;
  assert.equal(original.sketches[0].curves.length, 4);
  const crossing = original.sketches[0].curves[3];
  await page.keyboard.press("t");
  const p = await at(page, 2, 0);
  await page.mouse.move(p.x, p.y);
  assert.notEqual(await page.locator(".trim-span").getAttribute("points"), "");
  await click(page, 2, 0);
  const after = (await inspect(page)).document;
  assert.equal(await page.locator(".trim-local").count(), 0);
  assert.equal(await page.locator(".trim-span").getAttribute("points"), "");
  const curves = after.sketches[0].curves;
  assert.equal(curves.length, 5);
  assert.deepEqual(
    curves.find((c) => c.id === crossing.id),
    crossing,
  );
  for (const c of curves.filter((c) => c.id !== crossing.id)) {
    assert.ok(Math.max(c.a.x, c.b.x) <= 0 || Math.min(c.a.x, c.b.x) >= 4);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  // At a crossing, choose the shortest of the two bounded spans, not a chooser.
  await page.mouse.move(p.x + 40, p.y + 40);
  const origin = await at(page, 0, 0);
  await page.mouse.move(origin.x, origin.y);
  assert.notEqual(await page.locator(".trim-span").getAttribute("data-curve"), crossing.id);
  console.log(
    `${name}: stacked/reversed trim clears highlight and overlaps, preserves crossing, atomic Undo/Redo passed`,
  );
}
