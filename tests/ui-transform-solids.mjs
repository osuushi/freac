import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
async function factor(page, axis, value) {
  await page
    .getByRole("textbox", { name: `Transform scale ${axis}`, exact: true })
    .fill(String(value));
  return inspect(page);
}
async function accept(page) {
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  return inspect(page);
}
export async function transformSolidRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const p = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  const original = (await inspect(page)).document;
  assert.ok(await page.getByRole("button", { name: "Move body X", exact: true }).isVisible());
  await factor(page, "X", 2);
  await factor(page, "Y", 0.5);
  await factor(page, "Z", 3);
  let state = await accept(page);
  close(state.document.bodies[0].volume, original.bodies[0].volume * 3);
  const body = state.document.bodies[0];
  close(body.bounds[3] - body.bounds[0], 40);
  close(body.bounds[4] - body.bounds[1], 10);
  close(body.bounds[5] - body.bounds[2], 30);
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].center[0], body.center[0] + 5);
  await orient(page, [1, 1, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-solid-oblique.png` });
  await orient(page, [1, 0, 0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-solid-end-on.png` });
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: nonuniform whole body numeric factors, subsequent arrow movement, oblique/end-on box and Undo passed`,
  );
}
export async function transformSketchPlacementRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [2, 2], [10, 6]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Sketch on XZ", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [-10, 5], [-6, 5]);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Sketch 2", exact: true })
    .click({ modifiers: ["Shift"] });
  await chooseTool(page, "transform", "transform");
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Move sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  state.document.sketches.forEach((s, i) => {
    close(s.plane.origin[0], original.sketches[i].plane.origin[0] + 5);
  });
  await factor(page, "X", 2);
  state = await accept(page);
  assert.ok(state.document.sketches[1].curves.every((c) => c.kind === "bezier"));
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: multiple sketch arrow movement and world-axis box scaling with atomic Undo passed`,
  );
}
