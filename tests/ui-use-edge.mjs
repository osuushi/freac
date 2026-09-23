import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function useEdgeRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [5, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await chooseTool(page, "use body edge", "use-edge");
  for (const xy of [
    [0, 5],
    [0, -5],
  ]) {
    const p = await at(page, ...xy);
    await page.mouse.click(p.x, p.y);
    await inspect(page);
  }
  await chooseTool(page, "use body edge", "use-edge");
  let state = await inspect(page);
  const sketch = state.document.sketches[1];
  // Periodic rims are now single circular edges; picking both halves must not duplicate them.
  assert.equal(sketch.curves.length, 1);
  assert.equal(sketch.curves[0].kind, "circle");
  close(sketch.curves[0].radius, 5);
  assert.equal(sketch.constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 1);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  state = await inspect(page);
  close(state.modelingSelection[0].area, 25 * Math.PI);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("u");
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 1);
  close(state.preview.bodies[0].volume, 250 * Math.PI);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-copied-circle-union.png` });
}

export async function useLineEdgeRoute(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 3, 3),
    sourcePick = await at(page, 7, 7);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await bodySnaps(page);
  await chooseTool(page, "use body edge", "use-edge");
  for (const xy of [
    [-10, 0],
    [0, -10],
    [0, -10],
  ]) {
    const p = await at(page, ...xy);
    await page.mouse.click(p.x, p.y);
    await inspect(page);
  }
  assert.equal(
    (await inspect(page)).document.sketches[1].curves.length,
    2,
    "duplicate copy is a no-op",
  );
  await chooseTool(page, "use body edge", "use-edge");
  await page.keyboard.press("l");
  await drag(page, [-10, 10], [10, -10]);
  let state = await inspect(page);
  assert.equal(state.document.sketches[1].curves.length, 3);
  assert.equal(
    state.document.sketches[1].constraints.filter((c) => c.kind === "coincident").length,
    3,
  );
  const region = await at(page, -5, -5);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  close((await inspect(page)).modelingSelection[0].area, 200);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-2");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].volume, 1600);
  const exact = state.document.bodies[0].brep;
  await chooseTool(page, "hide bodies", "hide-bodies");
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.mouse.click(sourcePick.x, sourcePick.y);
  assert.equal((await inspect(page)).modelingSelection[0].sketch, state.document.sketches[0].id);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Move sketch Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation Z", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.sketches[0].plane.origin[2], 10);
  assert.equal(state.document.bodies[0].brep, exact);
  await chooseTool(page, "show bodies", "show-bodies");
}

async function bodySnaps(page) {
  await page.keyboard.press("l");
  await chooseTool(page, "grid snap", "grid");
  await drag(page, [-9.7, 9.7], [-4, 14]);
  const snapState = await inspect(page);
  const snappedLine = snapState.document.sketches[1].curves[0];
  close(snappedLine.a.x, -10);
  close(snappedLine.a.y, 10);
  assert.equal(
    snapState.document.sketches[1].constraints.length,
    0,
    "body snap adds no persistent relationship",
  );
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [-9.7, 9.7], [-4, 14], ["Shift"]);
  const unsnappedLine = (await inspect(page)).document.sketches[1].curves[0];
  assert.ok(Math.hypot(unsnappedLine.a.x + 10, unsnappedLine.a.y - 10) > 0.1);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "grid snap", "grid");
}
