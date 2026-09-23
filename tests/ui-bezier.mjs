import assert from "node:assert/strict";
import { at, click, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function handle(page, key, to, curve) {
  const selector = curve
    ? `[data-handle="${key}"][data-curve="${curve}"]`
    : `[data-handle="${key}"][data-curve]`;
  const h = await page.locator(selector).boundingBox();
  assert.ok(h);
  const p = await at(page, ...to);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}
export async function bezierRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("b");
  await drag(page, [-15, 0], [15, 0]);
  let curve = (await inspect(page)).document.sketches[0].curves[0];
  assert.equal(curve.kind, "bezier");
  await handle(page, "c1", [-5, 10]);
  await handle(page, "c2", [5, 10]);
  curve = (await inspect(page)).document.sketches[0].curves[0];
  close(curve.c1.y, 10);
  close(curve.c2.y, 10);
  await page.keyboard.press("v");
  await drag(page, [-15, 0], [-20, 0]);
  const moved = (await inspect(page)).document.sketches[0].curves[0];
  close(moved.a.x, -20);
  close(moved.c1.x, -10);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [15, 0], [-15, 0]);
  let s = await inspect(page);
  assert.equal(s.document.sketches[0].constraints.filter((c) => c.kind === "coincident").length, 2);
  await page.keyboard.press("l");
  await drag(page, [0, -5], [0, 12]);
  await page.keyboard.press("t");
  await click(page, 10, 4.1666666667);
  await inspect(page);
  s = await inspect(page);
  const trimmed = s.document.sketches[0].curves.find((c) => c.kind === "bezier");
  assert.ok(trimmed);
  assert.ok(trimmed.b.x < 1e-5, "trim removes only the right cubic span");
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await page.keyboard.press("v");
  const p = await at(page, 3, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  s = await inspect(page);
  assert.equal(s.modelingSelection[0].kind, "profile");
  close(s.modelingSelection[0].area, 150);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  s = await inspect(page);
  close(s.preview.bodies[0].volume, 450);
  await page.keyboard.press("Enter");
  await inspect(page);
  console.log(
    `${name}: cubic creation, handle/endpoint edits, fused closure, trim and extrusion passed`,
  );
}

export async function bezierFusionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-15, 0], [15, 0]);
  await page.keyboard.press("b");
  await drag(page, [-15, 0], [15, 0]);
  let sketch = (await inspect(page)).document.sketches[0];
  const [line, curve] = sketch.curves;
  assert.equal(curve.kind, "bezier");
  assert.equal(
    sketch.constraints.filter((constraint) => constraint.kind === "coincident").length,
    2,
    "the cubic curve fuses both snapped endpoints",
  );
  await page.keyboard.press("v");
  await drag(page, [-15, 0], [-20, 0]);
  sketch = (await inspect(page)).document.sketches[0];
  close(sketch.curves.find((item) => item.id === line.id).a.x, -20);
  close(sketch.curves.find((item) => item.id === curve.id).a.x, -20);
  console.log(`${name}: cubic endpoint fusion and linked endpoint movement passed`);
}

export async function bezierTangencyRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("b");
  await drag(page, [-10, 5], [0, 0]);
  await page.keyboard.press("v");
  await click(page, -4, 2);
  await page.keyboard.down("Shift");
  await click(page, 4, 0);
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  let sketch = (await inspect(page)).document.sketches[0];
  let curve = sketch.curves.find((item) => item.kind === "bezier");
  assert.equal(sketch.constraints.filter((item) => item.kind === "tangent").length, 1);
  assert.ok(curve?.kind === "bezier");
  if (curve?.kind !== "bezier") return;
  close(curve.c2.y, 0);
  await handle(page, "c2", [-3, 4]);
  sketch = (await inspect(page)).document.sketches[0];
  curve = sketch.curves.find((item) => item.kind === "bezier");
  assert.ok(curve?.kind === "bezier");
  if (curve?.kind !== "bezier") return;
  close(curve.c2.y, 0);
  console.log(`${name}: cubic tangent control and handle edit passed`);
}

export async function cubicTangentCouplingRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("b");
  await drag(page, [-10, 0], [0, 0]);
  await page.keyboard.press("b");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("v");
  await click(page, -4, 0);
  await page.keyboard.down("Shift");
  await click(page, 4, 0);
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  const initial = (await inspect(page)).document.sketches[0].curves;
  const [first, second] = initial;
  assert.equal(first.kind, "bezier");
  assert.equal(second.kind, "bezier");
  if (first.kind !== "bezier" || second.kind !== "bezier") return;
  await handle(page, "c1", [4, 4], second.id);
  const changed = (await inspect(page)).document.sketches[0].curves;
  const updatedFirst = changed.find((curve) => curve.id === first.id);
  const updatedSecond = changed.find((curve) => curve.id === second.id);
  assert.equal(updatedFirst?.kind, "bezier");
  assert.equal(updatedSecond?.kind, "bezier");
  if (updatedFirst?.kind !== "bezier" || updatedSecond?.kind !== "bezier") return;
  close(updatedSecond.c1.x, 4);
  close(updatedSecond.c1.y, 4);
  assert.notDeepEqual(updatedFirst.c2, first.c2);
  const priorSecondHandle = updatedSecond.c1;
  await handle(page, "c2", [-3, -4], first.id);
  const changedAgain = (await inspect(page)).document.sketches[0].curves;
  const updatedAgainFirst = changedAgain.find((curve) => curve.id === first.id);
  const updatedAgainSecond = changedAgain.find((curve) => curve.id === second.id);
  assert.equal(updatedAgainFirst?.kind, "bezier");
  assert.equal(updatedAgainSecond?.kind, "bezier");
  if (updatedAgainFirst?.kind !== "bezier" || updatedAgainSecond?.kind !== "bezier") return;
  close(updatedAgainFirst.c2.x, -3);
  close(updatedAgainFirst.c2.y, -4);
  assert.notDeepEqual(updatedAgainSecond.c1, priorSecondHandle);
  console.log(`${name}: cubic tangent handle coupling passed`);
}
