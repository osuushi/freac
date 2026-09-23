import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** Actual CAD controls, with grid-aligned coordinates across browser runtimes. */
export async function manualHelix(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if (String((await inspect(page)).gridSnap) !== "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [4, 0], [8, 4]);
  const center = await at(page, 6, 2),
    axis = await at(page, 0, -8);
  const original = (await inspect(page)).document;
  const points = original.sketches[0].curves.map((c) => c.a);
  assert(Math.abs(Math.min(...points.map((p) => p.x)) - 4) < 1e-6);
  assert(Math.abs(Math.max(...points.map((p) => p.x)) - 8) < 1e-6);
  assert(Math.abs(Math.max(...points.map((p) => p.y)) - 4) < 1e-6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await chooseTool(page, "revolve", "revolve");
  await page.mouse.click(axis.x, axis.y);
  assert(Math.abs((await inspect(page)).preview.bodies[0].volume - 192 * Math.PI) < 0.001);
  await page.getByRole("textbox", { name: "Revolution height", exact: true }).fill("16");
  await inspect(page);
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("720");
  const preview = (await inspect(page)).preview;
  assert(Math.abs(preview.bodies[0].volume - 384 * Math.PI) < 0.01);
  assert(Math.abs(preview.bodies[0].bounds[4] - 20) < 0.001, "Height is total travel");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  console.log(
    "PASS manual controls: grid-aligned sketch, explicit axis, two-turn continuous helix, total height and Undo/Redo",
  );
}
