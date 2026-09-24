import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { rotatedHandles } from "./ui-rotated-handles.mjs";
import { chooseTool } from "./ui-tools.mjs";

const curves = async (page) => (await inspect(page)).document.sketches[0].curves;
const rotate = (p, pivot, angle) => {
  const r = (angle * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r),
    x = p.x - pivot.x,
    y = p.y - pivot.y;
  return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
};
function transformed(before, after, map, tolerance = 1e-6) {
  for (const original of before) {
    const current = after.find((curve) => curve.id === original.id);
    assert.ok(current);
    for (const end of ["a", "b"]) {
      const expected = map(original[end]);
      assert.ok(Math.hypot(current[end].x - expected.x, current[end].y - expected.y) < tolerance);
    }
  }
}
async function drawSelection(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-25, -10], [-15, 0]);
  await page.keyboard.press("r");
  await drag(page, [5, 5], [15, 15]);
  await page.keyboard.press("l");
  await drag(page, [-6, -16], [6, -16]);
  await page.keyboard.press("Escape");
  assert.equal((await curves(page)).length, 9);
  await click(page, -21, -4);
  await page.keyboard.down("Shift");
  await click(page, 9, 11);
  await click(page, 2, -16);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 9);
  const before = await curves(page);
  await page.keyboard.press("m");
  await drag(page, [-21, -4], [-18, 0]);
  const moved = await curves(page);
  const dx = moved[0].a.x - before[0].a.x;
  const dy = moved[0].a.y - before[0].a.y;
  assert.ok(dx > 0 && dy > 0);
  transformed(before, moved, (p) => ({ x: p.x + dx, y: p.y + dy }));
  await page.keyboard.press("v");
  await page.keyboard.press("Escape");
  await drag(page, [-30, 24], [25, -20]);
  assert.equal(
    (await inspect(page)).selection.length,
    9,
    "Contained box selects both rectangles and line",
  );
}
async function rotationAndPivot(page) {
  const before = await curves(page),
    endpoints = before.flatMap((curve) => [curve.a, curve.b]),
    xs = endpoints.map((point) => point.x),
    ys = endpoints.map((point) => point.y),
    pivot = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  transformed(before, await curves(page), (p) => rotate(p, pivot, 30));
  const accepted = JSON.stringify((await inspect(page)).document);
  const anchor = await page
    .getByRole("button", { name: "Reposition sketch pivot", exact: true })
    .boundingBox();
  const origin = await at(page, 0, 0);
  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x, origin.y, { steps: 8 });
  await page.mouse.up();
  pointEquals((await inspect(page)).pivot, [0, 0]);
  assert.equal(
    JSON.stringify((await inspect(page)).document),
    accepted,
    "Pivot placement is not a model edit",
  );
  const view = await inspect(page),
    p = view.projection,
    handle = view.rotationHandle;
  const local = {
    x: (handle.x - p.origin.x) / (p.u.x - p.origin.x),
    y: (handle.y - p.origin.y) / (p.v.y - p.origin.y),
  };
  const target = rotate(local, { x: 0, y: 0 }, 15),
    screen = await at(page, target.x, target.y);
  const beforeDrag = await curves(page);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(screen.x, screen.y, { steps: 10 });
  await page.mouse.up();
  const afterDrag = await curves(page);
  const angle =
    ((Math.atan2(afterDrag[0].a.y, afterDrag[0].a.x) -
      Math.atan2(beforeDrag[0].a.y, beforeDrag[0].a.x)) *
      180) /
    Math.PI;
  assert.ok(Math.abs(angle - 15) < 1);
  transformed(beforeDrag, afterDrag, (point) => rotate(point, { x: 0, y: 0 }, angle), 1e-4);
  await chooseTool(page, "undo", "undo");
  assert.equal(JSON.stringify((await inspect(page)).document), accepted);
  await chooseTool(page, "redo", "redo");
}
async function rotatedResizeAndExit(page, name) {
  const state = await inspect(page),
    sketch = state.document.sketches[0],
    group = sketch.groups[0];
  const points = group.members.map((id) => sketch.curves.find((curve) => curve.id === id).a);
  await click(page, (points[0].x + points[2].x) / 2, (points[0].y + points[2].y) / 2);
  const left = { x: (points[0].x + points[3].x) / 2, y: (points[0].y + points[3].y) / 2 };
  await click(page, left.x, left.y);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("14");
  await page.keyboard.press("Enter");
  const changed = (await inspect(page)).document.sketches[0],
    corners = group.members.map((id) => changed.curves.find((curve) => curve.id === id).a);
  pointEquals(corners[1], [points[1].x, points[1].y]);
  pointEquals(corners[2], [points[2].x, points[2].y]);
  close(Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y), 14);
  await rotatedHandles(page);
  const beforeOrbit = JSON.stringify((await inspect(page)).document);
  await page.screenshot({ path: `.cache/sketch-review/${name}-selection.png` });
  await orient(page, [0.5, 0.5, 1]);
  await page.waitForFunction(() => window.freacInspect().activePlane === null);
  assert.equal((await inspect(page)).activePlane, null);
  assert.equal(JSON.stringify((await inspect(page)).document), beforeOrbit);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeOrbit);
  await click(page, (corners[0].x + corners[2].x) / 2, (corners[0].y + corners[2].y) / 2);
  await chooseTool(page, "delete", "delete");
  assert.equal((await curves(page)).length, 5);
  await chooseTool(page, "undo", "undo");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeOrbit);
  await chooseTool(page, "clear sketch", "clear-sketch");
  assert.equal((await curves(page)).length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeOrbit);
}
async function overlapChoice(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("r");
  await drag(page, [-5, -5], [15, 15]);
  await page.keyboard.press("Escape");
  await click(page, 1.5, 1.5);
  const initial = (await inspect(page)).selection;
  await page.getByRole("button", { name: "Rectangle 2", exact: true }).click();
  const state = await inspect(page);
  assert.notDeepEqual(state.selection, initial);
  assert.ok(
    state.document.sketches[0].groups.some(
      (group) =>
        JSON.stringify([...state.selection].sort()) === JSON.stringify([...group.members].sort()),
    ),
  );
}
export async function selectionRoute(page, name) {
  await drawSelection(page);
  await rotationAndPivot(page);
  await rotatedResizeAndExit(page, name);
  await overlapChoice(page);
  console.log(
    `${name}: mixed selection, move, box, rotation/pivot, rotated resize, re-entry, Delete/Clear and overlap choice passed`,
  );
}
