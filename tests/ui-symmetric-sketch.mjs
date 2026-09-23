import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import {
  at,
  click,
  close,
  corners,
  drag,
  inspect,
  pointEquals,
  reset,
  settled,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function symmetricSketchRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("r");
    await drag(page, [4, 4], [14, 10], ["Alt"]);
    let points = await corners(page);
    pointEquals(points[0], [-6, -2]);
    pointEquals(points[2], [14, 10]);
    await page.getByRole("textbox", { name: "Width", exact: true }).fill("32");
    await page.keyboard.press("Enter");
    points = await corners(page);
    pointEquals(points[0], [-12, -2]);
    pointEquals(points[2], [20, 10]);
    // Reselection and centered side resize move the opposite side equally.
    await page.keyboard.press("Escape");
    await click(page, 20, 4);
    await drag(page, [20, 4], [22, 4], ["Alt"]);
    points = await corners(page);
    pointEquals(points[0], [-14, -2]);
    pointEquals(points[2], [22, 10]);
    await click(page, 22, 10);
    await drag(page, [22, 10], [24, 12], ["Alt"]);
    points = await corners(page);
    pointEquals(points[0], [-16, -4]);
    pointEquals(points[2], [24, 12]);
    const saved = JSON.stringify((await inspect(page)).document);
    await chooseTool(page, "undo", "undo");
    pointEquals((await corners(page))[2], [22, 10]);
    await chooseTool(page, "redo", "redo");
    assert.equal(JSON.stringify((await inspect(page)).document), saved);
  }
  const saved = (await inspect(page)).document;
  const path = resolve(`.cache/sketch-review/${name}-symmetric.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  assert.deepEqual((await inspect(page)).document.sketches, saved.sketches);
  await centeredLineAndModifiers(page);
  await attachmentsAndLocks(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-symmetric-sketch.png` });
  console.log(
    `${name}: centered creation, rectangle re-edit, numeric extent, live modifiers and history passed`,
  );
}

async function centeredLineAndModifiers(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  const a = await at(page, 0, 0),
    b = await at(page, 10, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.down("Alt"); // Stationary pointer updates immediately.
  await settled(page);
  pointEquals((await inspect(page)).preview.sketches[0].curves[0].a, [-10, 0]);
  await page.keyboard.up("Alt");
  await settled(page);
  pointEquals((await inspect(page)).preview.sketches[0].curves[0].a, [0, 0]);
  await page.keyboard.down("Alt");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  let line = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(line.a, [-10, 0]);
  pointEquals(line.b, [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [10, 0], [20, 0], ["Shift"]);
  const sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.constraints.length, 0, "Shift bypass suppresses endpoint attachment");
  pointEquals(sketch.curves[1].a, [10, 0]);
  pointEquals(sketch.curves[1].b, [20, 0]);
  await page.keyboard.press("l");
  const c = await at(page, 0, 10),
    d = await at(page, 8, 15);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 5 });
  await page.keyboard.down("Alt");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 2);
  // Circle already has center/radius semantics; Option leaves radius unchanged.
  await page.keyboard.press("c");
  await drag(page, [-20, 16], [-14, 16], ["Alt"]);
  line = (await inspect(page)).document.sketches[0].curves.at(-1);
  assert.equal(line.kind, "circle");
  close(line.radius, 6);
}

async function attachmentsAndLocks(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [10, 0], [20, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0], ["Alt"]);
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.constraints.length, 1, "Option permits cursor endpoint Fuse");
  pointEquals(sketch.curves[1].a, [-10, 0]);
  pointEquals(sketch.curves[1].b, [10, 0]);
  // Shift at pointerdown on selected endpoint edits without toggling point selection.
  await click(page, -10, 0);
  await drag(page, [-10, 0], [-12, 2], ["Shift"]);
  sketch = (await inspect(page)).document.sketches[0];
  pointEquals(sketch.curves[1].a, [-12, 2]);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [10, 6], ["Alt"]);
  await page.getByRole("button", { name: "Lock Width", exact: true }).click();
  await page.locator("canvas").focus();
  await page.keyboard.press("v");
  const before = (await inspect(page)).document;
  await click(page, 10, 2);
  await drag(page, [10, 2], [14, 2], ["Alt"]);
  assert.deepEqual((await inspect(page)).document, before, "Symmetry cannot override a width lock");
  await page.getByRole("button", { name: "Unlock Width", exact: true }).click();
  await click(page, 10, 2);
  await drag(page, [10, 2], [14, 2], ["Alt"]);
  pointEquals((await corners(page))[0], [-14, -6]);
}
