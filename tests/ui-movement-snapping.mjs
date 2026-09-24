import assert from "node:assert/strict";
import { click, corners, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function gridSpacing(page) {
  const status = await page.getByRole("status").textContent();
  const match = status.match(/([\d.]+) mm grid/);
  assert.ok(match, "The visible sketch status reports its grid spacing");
  return Number(match[1]);
}

export async function movementSnappingRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 0]);
  await page.keyboard.press("v");
  const original = (await inspect(page)).document;
  const step = await gridSpacing(page);
  const delta = [Math.round(3.2 / step) * step, Math.round(2.2 / step) * step];
  // A fractional grab along the edge must not round that grab to the grid.
  await drag(page, [5.3, 0], [8.5, 2.2]);
  let curve = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(curve.a, delta);
  pointEquals(curve.b, [20 + delta[0], delta[1]]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await click(page, 5.3, 0); // Undo clears selection; Shift-drag bypass edits an existing selection.
  await drag(page, [5.3, 0], [8.5, 2.2], ["Shift"]);
  curve = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(curve.a, delta);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const rectangleStep = await gridSpacing(page);
  const extent = [11 * rectangleStep, 7 * rectangleStep];
  await drag(page, [0, 0], extent);
  await page.keyboard.press("v");
  // Half-grid center plus arbitrary body grab also preserves existing alignment.
  await drag(page, [4.3, 3.2], [7.5, 5.4]);
  pointEquals((await corners(page))[0], delta);
  pointEquals((await corners(page))[2], [extent[0] + delta[0], extent[1] + delta[1]]);
  console.log(`${name}: arbitrary line/body grabs snap displacement and preserve Undo passed`);
}

export async function rectangleEdgeRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("r");
    await drag(page, [-10, -6], [10, 6]);
    await page.keyboard.press("v");
    const original = (await inspect(page)).document;
    for (const [from, to, a, c] of [
      [
        [-4, -6],
        [-4, -10],
        [-10, -10],
        [10, 6],
      ],
      [
        [10, -2],
        [14, -2],
        [-10, -6],
        [14, 6],
      ],
      [
        [4, 6],
        [4, 10],
        [-10, -6],
        [10, 10],
      ],
      [
        [-10, 2],
        [-14, 2],
        [-14, -6],
        [10, 6],
      ],
    ]) {
      await click(page, 25, 20);
      await drag(page, from, to);
      const points = await corners(page);
      pointEquals(points[0], a);
      pointEquals(points[2], c);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, original);
    }
  }
  console.log(`${name}: arbitrary rectangle edge grabs resize every side on all planes passed`);
}

export async function movementGeometrySnapRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 0]);
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("c");
  await drag(page, [28.3, 12.4], [31.3, 12.4], ["Shift"]);
  const target = (await inspect(page)).document.sketches[0].curves[1].center;
  assert.ok(Math.abs(target.y - Math.round(target.y)) > 0.2);
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("v");
  await click(page, 5.3, 0);
  const projection = (await inspect(page)).projection;
  await page.evaluate(() =>
    window.addEventListener(
      "pointerdown",
      (event) => {
        window.grabX = event.clientX;
      },
      { once: true },
    ),
  );
  await drag(page, [5.3, 0], [target.x, target.y]);
  const actualGrab = await page.evaluate(() => window.grabX);
  const anchorX = (actualGrab - projection.origin.x) / (projection.u.x - projection.origin.x);
  const moved = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(moved.a, [target.x - anchorX, target.y]);
  await chooseTool(page, "undo", "undo");
  await click(page, 5.3, 0);
  await drag(page, [5.3, 0], [target.x, target.y], ["Shift"]);
  const bypassed = (await inspect(page)).document.sketches[0].curves[0];
  const step = await gridSpacing(page);
  assert.equal(bypassed.a.x / step, Math.round(bypassed.a.x / step));
  assert.equal(bypassed.a.y / step, Math.round(bypassed.a.y / step));
  console.log(
    `${name}: exact geometry target overrides displacement grid; Shift bypass retains grid passed`,
  );
}

export async function rotatedEdgeRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("37");
  await page.keyboard.press("Enter");
  await chooseTool(page, "select", "select");
  await chooseTool(page, "grid snap", "grid");
  const original = (await inspect(page)).document;
  for (let index = 0; index < 4; index++) {
    await click(page, 25, 20);
    const side = original.sketches[0].curves[index];
    const dx = side.b.x - side.a.x,
      dy = side.b.y - side.a.y;
    const length = Math.hypot(dx, dy);
    const from = [side.a.x + dx * 0.25, side.a.y + dy * 0.25];
    await click(page, ...from);
    await drag(page, from, [from[0] + (3 * dy) / length, from[1] - (3 * dx) / length], ["Shift"]);
    const after = (await inspect(page)).document.sketches[0];
    const moved = after.curves[index];
    const delta = [moved.a.x - side.a.x, moved.a.y - side.a.y];
    assert.ok(
      Math.abs(Math.hypot(...delta) - 3) < 0.12,
      JSON.stringify({ index, delta, side, moved }),
    );
    assert.ok(Math.abs(delta[0] * dx + delta[1] * dy) < 1e-6);
    pointEquals(moved.b, [side.b.x + delta[0], side.b.y + delta[1]]);
    const opposite = after.curves[(index + 2) % 4];
    const fixed = original.sketches[0].curves[(index + 2) % 4];
    assert.equal(opposite.id, fixed.id);
    pointEquals(opposite.a, [fixed.a.x, fixed.a.y]);
    pointEquals(opposite.b, [fixed.b.x, fixed.b.y]);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log(
    `${name}: rotated arbitrary edge grabs move only the edge normal, opposite fixed, Undo passed`,
  );
}
