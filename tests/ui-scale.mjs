import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { clearSelection, pickFace } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
async function start(page) {
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
}
async function factor(page, value) {
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill(String(value));
  return inspect(page);
}
async function accept(page) {
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  return inspect(page);
}
async function center(locator) {
  const b = await locator.boundingBox();
  assert.ok(b);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function history(page, before, after) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
}
async function archive(page, name, expected) {
  const path = resolve(`.cache/sketch-review/${name}-scale.freac`);
  await saveDocument(page, path);
  await openDocument(page, path);
  const doc = (await inspect(page)).document;
  assert.deepEqual(doc.sketches, expected.sketches);
  assert.deepEqual(
    doc.bodies.map((b) => b.id),
    (expected.bodies ?? []).map((b) => b.id),
  );
  for (let i = 0; i < doc.bodies.length; i++) {
    close(doc.bodies[i].volume, expected.bodies[i].volume);
    assert.deepEqual(
      doc.bodies[i].faces.map((f) => f.id),
      expected.bodies[i].faces.map((f) => f.id),
    );
  }
}
export async function scaleSketchRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [5, 3], [15, 9]);
  const original = (await inspect(page)).document;
  await start(page);
  const pivot = await center(page.locator(".move-anchor:visible"));
  const origin = original.sketches[0].curves[0].a;
  const endpoint = original.sketches[0].curves[0].b;
  const corner = await at(page, origin.x, origin.y);
  await page.mouse.move(pivot.x, pivot.y);
  await page.mouse.down();
  await page.mouse.move(corner.x, corner.y, { steps: 6 });
  await page.mouse.up();
  const state = await factor(page, 2);
  assert.deepEqual(state.document, original);
  const curve = state.preview.sketches[0].curves[0];
  close(curve.a.x, origin.x);
  close(curve.a.y, origin.y);
  close(curve.b.x, origin.x + 2 * (endpoint.x - origin.x));
  close(curve.b.y, origin.y + 2 * (endpoint.y - origin.y));
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal((await inspect(page)).interaction.kind, "scale", "released preview survives blur");
  await factor(page, 0);
  assert.ok(
    await page.getByRole("button", { name: "Accept transform scale", exact: true }).isDisabled(),
  );
  await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
  await start(page);
  assert.equal(
    await page.getByLabel("Transform scale X", { exact: true }).getAttribute("aria-invalid"),
    "false",
  );
  await factor(page, 2);
  const accepted = (await accept(page)).document;
  await history(page, original, accepted);
  await sketchGestureChecks(page, name, accepted);
  await archive(page, name, accepted);
  console.log(
    `${name}: scale sketch pointer pivot/Command/glyph, typing, reject/recovery, modal blur, cancellation, history and archive passed`,
  );
}
async function sketchGestureChecks(page, name, accepted) {
  await start(page);
  const camera = (await inspect(page)).camera;
  const anchor = await center(page.locator(".move-anchor:visible"));
  await page.keyboard.down("Meta");
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 23, anchor.y + 13, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  let state = await inspect(page);
  assert.ok(state.activePlane, "Command pivot drag does not exit sketch");
  assert.deepEqual(state.camera, camera, "Command pivot drag does not orbit");
  const handle = await center(page.locator(".transform-box-handle:visible").last());
  const sphere = await center(page.locator(".move-anchor:visible"));
  const len = Math.hypot(handle.x - sphere.x, handle.y - sphere.y);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + (48 * (handle.x - sphere.x)) / len,
    handle.y + (48 * (handle.y - sphere.y)) / len,
    { steps: 8 },
  );
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(Number(await page.getByLabel("Transform scale X", { exact: true }).inputValue()) > 1.1);
  assert.deepEqual(state.document, accepted, "glyph release stays temporary");
  await page.screenshot({ path: `.cache/sketch-review/${name}-scale-sketch.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await start(page);
  const held = await center(page.locator(".transform-box-handle:visible").last());
  await page.mouse.move(held.x, held.y);
  await page.mouse.down();
  await page.mouse.move(held.x + 12, held.y - 12);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction, null, "held drag cleans up on blur");
  assert.deepEqual((await inspect(page)).document, accepted);
}
export async function scaleBodyRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const c = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(c.x, c.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const before = (await inspect(page)).document;
  await start(page);
  let state = await factor(page, 1.5);
  close(state.preview.bodies[0].volume, before.bodies[0].volume * 1.5 ** 3);
  await orient(page, [1, 1, 1]);
  assert.equal((await inspect(page)).interaction.kind, "scale");
  await page.screenshot({ path: `.cache/sketch-review/${name}-scale-oblique.png` });
  const glyph = await page.locator(".transform-box-handle:visible").last().boundingBox();
  await page.mouse.move(950, 650);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -30);
  await page.keyboard.up("Control");
  await inspect(page);
  const zoomed = await page.locator(".transform-box-handle:visible").last().boundingBox();
  assert.ok(
    Math.abs(zoomed.width - glyph.width) < 0.01,
    "glyph width stays fixed to subpixel precision",
  );
  assert.ok(
    Math.abs(zoomed.height - glyph.height) < 0.01,
    "glyph height stays fixed to subpixel precision",
  );
  await orient(page, [1, 0, 0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-scale-end-on.png` });
  const whole = (await accept(page)).document;
  await history(page, before, whole);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  const body = (await inspect(page)).document.bodies[0];
  const cap = body.faces.find((f) =>
    f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
  );
  await pickFace(page, cap);
  await start(page);
  state = await factor(page, 0.7);
  close(state.preview.bodies[0].volume, (body.volume * (1 + 0.7 + 0.49)) / 3);
  const tapered = (await accept(page)).document;
  await history(page, before, tapered);
  await archive(page, `${name}-face`, tapered);
  await pickFace(
    page,
    (await inspect(page)).document.bodies[0].faces.find((f) => f.id === cap.id),
  );
  await start(page);
  await factor(page, 1 / 0.7);
  state = await accept(page);
  close(state.document.bodies[0].volume, body.volume);
  await clearSelection(page);
  await orient(page, [0, 0, 1]);
  const p = await project(page, [0, 10, 10]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "edge");
  await start(page);
  state = await factor(page, 0.8);
  assert.ok(state.preview.bodies[0].volume < body.volume);
  await page.screenshot({ path: `.cache/sketch-review/${name}-scale-edge.png` });
  await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
  assert.equal((await inspect(page)).interaction, null);
  console.log(
    `${name}: body and local face/edge scale, reconnection taper, history, archive and re-edit passed`,
  );
}
