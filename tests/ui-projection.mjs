import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function projectionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -15], [20, 15]);
  const center = await at(page, 5, 5);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  const circle = (await inspect(page)).document.sketches.at(-1);
  const circlePoint = await at(page, 6, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(circlePoint.x, circlePoint.y);
  await inspect(page);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Rotate sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Rotation X", exact: true }).fill("45");
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [0, 0, 1]);
  await chooseTool(page, "project", "project");
  await inspect(page);
  await page.mouse.click(center.x, center.y);
  let state = await inspect(page);
  assert.ok(state.preview, "face-target projection has a preview");
  const projected = state.preview.sketches.find(
    (s) => s.id !== circle.id && s.curves.some((c) => c.kind === "bezier"),
  );
  assert.ok(projected);
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.activeSketch, projected.id);
  assert.ok(
    state.document.sketches
      .find((s) => s.id === projected.id)
      .curves.some((c) => c.kind === "bezier"),
  );
  const accepted = state.document;
  await chooseTool(page, "undo", "undo");
  state = await inspect(page);
  assert.ok(!state.document.sketches.some((s) => s.curves.some((c) => c.kind === "bezier")));
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await projectActiveEdge(page, accepted, projected.id);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection.png` });
  await archive(page, name);
  console.log(
    `${name}: face-target cubic projection, coplanar reuse, active sketch edge projection, preview/cancel/Undo passed`,
  );
}

async function projectActiveEdge(page, accepted, sketchId) {
  let state = await inspect(page);
  await page.keyboard.press("v");
  await click(page, 15, 10);
  await chooseTool(page, "project", "project");
  await inspect(page);
  const bottom = Math.min(
    ...state.document.sketches[0].curves.flatMap((curve) => [curve.a.y, curve.b.y]),
  );
  const edge = await project(page, [0, bottom, 5]);
  await page.mouse.click(edge.x, edge.y);
  state = await inspect(page);
  assert.ok(state.preview, "active sketch edge projection preview");
  await page.getByRole("button", { name: "Cancel projection", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "project", "project");
  await inspect(page);
  await page.mouse.click(edge.x, edge.y);
  await inspect(page);
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await inspect(page);
  assert.ok(
    state.document.sketches.find((s) => s.id === sketchId).curves.some((c) => c.kind === "segment"),
  );
}

async function archive(page, name) {
  const before = (await inspect(page)).document;
  const file = resolve(`.cache/sketch-review/${name}-projection.freac`);
  await saveDocument(page, file);
  await reset(page);
  await openDocument(page, file);
  await page.waitForFunction(() => window.freacInspect().document.sketches.length === 3);
  assert.deepEqual((await inspect(page)).document.sketches, before.sketches);
  await page.getByRole("button", { name: "Select Sketch 3", exact: true }).click();
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  await inspect(page);
  assert.ok(await page.locator('[data-handle="c1"][data-curve]').count());
}
