import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, reset } from "./ui-helpers.mjs";
import { hold } from "./ui-overlap-gesture.mjs";
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
  console.log(name, "plane thumbnails include visible coplanar sketches only");
}
