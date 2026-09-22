import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function pick(page, xyz) {
  const p = await project(page, xyz);
  await page.mouse.click(p.x, p.y);
}
async function quantity(page, label, value) {
  await page.getByRole("textbox", { name: label, exact: true }).fill(String(value));
  await inspect(page);
}
async function start(page, center, axis) {
  await pick(page, center);
  await chooseTool(page, "revolve", "revolve");
  await pick(page, axis);
  await inspect(page);
}
export async function revolveSolidRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [10, 5]);
  await chooseTool(page, "return to modeling", "modeling");
  await start(page, [5, 2.5, 0], [0, -5, 0]);
  close((await inspect(page)).preview.bodies[0].volume, 500 * Math.PI);
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const shaft = (await inspect(page)).document.bodies[0];
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [8, 1], [12, 3], ["Shift"]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  await pick(page, [9, 2, 0]);
  await page.keyboard.down("Shift");
  await pick(page, [11, 2, 0]);
  await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  await chooseTool(page, "revolve", "revolve");
  await pick(page, [0, -5, 0]);
  close((await inspect(page)).preview.bodies[0].volume, shaft.volume - 72 * Math.PI);
  assert.equal(
    await page.getByRole("button", { name: "Subtract", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("i");
  close((await inspect(page)).preview.bodies[0].volume, 72 * Math.PI);
  await page.keyboard.press("u");
  close((await inspect(page)).preview.bodies[0].volume, shaft.volume + 88 * Math.PI);
  await page.keyboard.press("n");
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.getByRole("button", { name: "Subtract", exact: true }).click();
  await page.getByRole("button", { name: "Target body 1", exact: true }).click();
  assert.ok(
    await page.getByRole("button", { name: "Accept revolution", exact: true }).isDisabled(),
  );
  await page.getByRole("button", { name: "Target body 1", exact: true }).click();
  await inspect(page);
  // A subsequent ordinary selection accepts the valid groove in one edit.
  await pick(page, [-20, -15, 0]);
  close((await inspect(page)).document.bodies[0].volume, shaft.volume - 72 * Math.PI);
  await chooseTool(page, "undo", "undo");
  close((await inspect(page)).document.bodies[0].volume, shaft.volume);
  await partialFaceRoute(page, name);
  console.log(
    `${name}: revolved groove Boolean modes/participants and selection acceptance; body-edge axis, face input and continued planar sketch passed`,
  );
}

async function partialFaceRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [3, -5], [9, 5]);
  await chooseTool(page, "return to modeling", "modeling");
  await start(page, [6, 0, 0], [0, -8, 0]);
  await quantity(page, "Revolution angle", -90);
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const accepted = (await inspect(page)).document;
  close(accepted.bodies[0].volume, 180 * Math.PI);
  // Hide source sketch so the partial end face is selected directly.
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await orient(page, [0, 0, -1]);
  await pick(page, [6, 0, 0]);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  await chooseTool(page, "revolve", "revolve");
  await pick(page, [3, 0, 0]); // Straight inner edge of the actual partial body's cap.
  let state = await inspect(page);
  assert.ok(state.preview, await page.locator(".status").textContent());
  await page.keyboard.press("n");
  close((await inspect(page)).preview.bodies.at(-1).volume, 360 * Math.PI);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("c");
  // Use an actual cap triangle centroid transformed into its sketch coordinates.
  state = await inspect(page);
  // The face sketch plane can have a translated origin; project a known world point
  // using the read-only active projection and the known planar support.
  const projection = state.projection;
  const desired = await project(page, [6, 0, 0]);
  const ux = projection.u.x - projection.origin.x,
    uy = projection.u.y - projection.origin.y;
  const vx = projection.v.x - projection.origin.x,
    vy = projection.v.y - projection.origin.y;
  const dx = desired.x - projection.origin.x,
    dy = desired.y - projection.origin.y;
  const det = ux * vy - uy * vx;
  const local = [(dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det];
  await drag(page, local, [local[0] + 1, local[1]]);
  const circle = await at(page, ...local);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(circle.x, circle.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await quantity(page, "Extrusion distance", 2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("n");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 2);
  assert.equal(state.document.bodies.length, 2);
  close(state.document.bodies.at(-1).volume, 2 * Math.PI);
  await page.screenshot({ path: `.cache/sketch-review/${name}-revolve-face-loop.png` });
}
