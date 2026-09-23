import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
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
export async function transformSolidRoute(page, name, round = false) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press(round ? "c" : "r");
  await drag(page, round ? [0, 0] : [-10, -10], round ? [10, 0] : [10, 10]);
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
  assert.ok(await page.getByRole("button", { name: "Move body X", exact: true }).isVisible());
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  let state = await inspect(page);
  assert.equal(state.interaction?.kind, "body-move");
  close(state.document.bodies[0].volume, original.bodies[0].volume * 3);
  const body = state.document.bodies[0];
  close(body.bounds[3] - body.bounds[0], 40);
  close(body.bounds[4] - body.bounds[1], 10);
  close(body.bounds[5] - body.bounds[2], 30);
  await page.locator(".body-transform-value").fill("5");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].center[0], body.center[0] + 5);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-solid-end-on.png` });
  await orient(page, [1, 1, 1]);
  const center = state.document.bodies[0].center;
  const inside = await project(page, [center[0] + 5, center[1], center[2]]);
  await page.keyboard.down("Meta");
  await page.mouse.move(inside.x, inside.y);
  await page.mouse.down();
  await page.mouse.move(inside.x + 45, inside.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  state = await inspect(page);
  const change = state.document.bodies[0].center.map((value, i) => value - center[i]);
  assert.ok(Math.hypot(...change) > 1, `Command box move: ${change}`);
  assert.ok(
    change.some((value) => Math.abs(value) < 1e-4),
    `Movement must stay in the anchor plane: ${change}`,
  );
  assert.equal(state.camera.orbitActive, false);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-solid-oblique.png` });
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: nonuniform whole body numeric factors, subsequent arrow movement, oblique/end-on box and Undo passed`,
  );
}
export async function transformSketchPlacementRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [2, 2], [10, 6]);
  await chooseTool(page, "return to modeling", "modeling");
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
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
