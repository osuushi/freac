import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { hold, releaseChoice } from "./ui-overlap-gesture.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function planeSketchPreview(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "circle", "circle");
  await drag(page, [0, 0], [8, 0]);
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, 1, 1]);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  const paths = (label) =>
    panel.getByRole("button", { name: label, exact: true }).locator("svg path").last();
  await hold(page, await project(page, [0, 0, 0]));
  const count = async (label) => ((await paths(label).getAttribute("d"))?.match(/M/g) ?? []).length;
  assert.equal(await panel.getByRole("button", { name: "Sketch", exact: true }).count(), 0);
  assert.equal(await count("Plane · XY"), 2, "Plane border and visible circle are drawn");
  assert.equal(await count("Plane · XZ"), 1, "Other plane does not inherit the sketch");
  await page.screenshot({ path: `.cache/sketch-review/${name}-plane-sketch-preview.png` });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await hold(page, await project(page, [0, 0, 0]));
  assert.equal(await count("Plane · XY"), 1, "Hidden sketch is omitted");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await movedSketch(page, panel);
  console.log(name, "plane thumbnails, moved sketch choice and coplanar deduplication passed");
}

async function movedSketch(page, panel) {
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move sketch Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation Z", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.equal(state.document.sketches[0].plane.origin[2], 10);
  await page.keyboard.press("Escape");
  await hold(page, await project(page, [0, 0, 10]));
  const sketch = panel.getByRole("button", { name: "Sketch", exact: true });
  await sketch.hover();
  assert.equal(await panel.getAttribute("data-highlight"), state.document.sketches[0].id);
  assert.ok((await sketch.locator("svg path").last().getAttribute("d")).includes("L"));
  await releaseChoice(page, "Sketch");
  state = await inspect(page);
  assert.equal(state.modelingSelection[0].kind, "sketch");
  assert.equal(state.modelingSelection[0].sketch, state.document.sketches[0].id);
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await hold(page, await project(page, [0, 0, 10]));
  assert.equal(await sketch.count(), 0, "Hidden displaced sketch is omitted");
  await page.keyboard.press("Escape");
  await page.mouse.up();
}
