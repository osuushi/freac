import assert from "node:assert/strict";
import { chooseTool } from "./ui-tools.mjs";
export async function settled(page) {
  await page.waitForFunction(() => {
    const state = window.freacInspect?.();
    return state && !state.busy && !state.camera.moving;
  });
}
export async function inspect(page) {
  await settled(page);
  return page.evaluate(() => window.freacInspect());
}
export async function reset(page) {
  await settled(page);
  await chooseTool(page, "new document", "new");
  await settled(page);
  await page.reload();
  await settled(page);
}
export async function at(page, x, y) {
  const { projection: p } = await inspect(page);
  assert.ok(p, "A sketch plane must be explicitly active");
  return {
    x: p.origin.x + (p.u.x - p.origin.x) * x + (p.v.x - p.origin.x) * y,
    y: p.origin.y + (p.u.y - p.origin.y) * x + (p.v.y - p.origin.y) * y,
  };
}
export async function drag(page, from, to, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  const a = await at(page, ...from),
    b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  for (const modifier of modifiers) await page.keyboard.up(modifier);
  await settled(page);
}
export async function click(page, x, y) {
  const point = await at(page, x, y);
  await page.mouse.click(point.x, point.y);
}
export async function corners(page) {
  const { document } = await inspect(page);
  const sketch = document.sketches[0];
  assert.ok(sketch?.groups[0], "A committed rectangle must exist");
  return sketch.groups[0].members.map((id) => sketch.curves.find((curve) => curve.id === id).a);
}
export function close(actual, expected, label = "coordinate") {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}
export function pointEquals(actual, expected) {
  close(actual.x, expected[0], "x");
  close(actual.y, expected[1], "y");
}

export async function inspectPointChoices(page, x, y) {
  const point = await at(page, x, y);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
}
