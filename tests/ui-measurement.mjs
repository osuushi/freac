import assert from "node:assert/strict";
import * as THREE from "three";
import { project } from "./ui-blend-edit.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function orient(page, normal) {
  const { camera } = await inspect(page);
  const view = new THREE.PerspectiveCamera();
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  const desired = new THREE.Vector3(...normal)
    .normalize()
    .applyQuaternion(view.quaternion.clone().invert());
  const denominator = Math.sqrt(2 * (1 + desired.z));
  const dx = -desired.x / denominator,
    dy = -desired.y / denominator;
  assert.ok(Math.hypot(dx, dy) <= 0.8, "Use the spherical part of Arcball");
  const bounds = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2,
    r = Math.min(bounds.width, bounds.height) / 2;
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + dx * r, y - dy * r, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await inspect(page);
}

export async function readout(page, label, value) {
  await page.waitForFunction(
    ({ label, value }) =>
      [...document.querySelectorAll(".measurement-readout > div")].some(
        (row) =>
          row.firstElementChild?.textContent === label &&
          row.lastElementChild?.textContent === value,
      ),
    { label, value },
  );
}
export async function pick(page, point, shift = false) {
  const p = await project(page, point);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
  return inspect(page);
}
export async function measurementRoute(page, name) {
  await plate(page);
  const original = (await inspect(page)).document;
  const history = await page.evaluate(() => window.freacHistory());
  await readout(page, "Line angle", "90 °");
  await readout(page, "Maximum gap", "20 mm");
  assert.equal(await page.locator(".measurement-witnesses line").count(), 2);
  await clearSelection(page);
  assert.equal(await page.getByRole("region", { name: "Measurements" }).isVisible(), false);
  await orient(page, [0.4, -1, 0.7]);
  let state = await pick(page, [-5, -10, 4]);
  assert.equal(state.modelingSelection[0].kind, "face");
  await readout(page, "Area", "200 mm²");
  await orient(page, [0.4, 1, 0.7]);
  state = await pick(page, [-5, 10, 4], true);
  assert.equal(state.modelingSelection.length, 2);
  assert.ok(state.modelingSelection.every((t) => t.kind === "face"));
  await readout(page, "Minimum gap", "20 mm");
  await readout(page, "Maximum gap", "20 mm");
  await readout(page, "Relationship", "Parallel");
  const line = await page.locator(".measurement-witnesses line").first().getAttribute("x1");
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(60, 30);
  await inspect(page);
  assert.notEqual(
    await page.locator(".measurement-witnesses line").first().getAttribute("x1"),
    line,
  );
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual(await page.evaluate(() => window.freacHistory()), history);
  await page.screenshot({ path: `.cache/sketch-review/${name}-measurements.png` });
  await page.getByRole("textbox", { name: "Face offset distance", exact: true }).fill("1");
  await inspect(page);
  assert.equal(await page.getByRole("region", { name: "Measurements" }).isVisible(), false);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  await inspect(page);
  await readout(page, "Maximum gap", "22 mm");
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await readout(page, "Maximum gap", "20 mm");
  await clearSelection(page);
  await orient(page, [0.4, -1, 0.7]);
  await pick(page, [-5, -10, 4]);
  await orient(page, [0.4, 1, 0.7]);
  state = await pick(page, [-5, 10, 10], true);
  assert.deepEqual(
    state.modelingSelection.map((t) => t.kind),
    ["face", "edge"],
  );
  await readout(page, "Maximum gap", "20 mm");
  await readout(page, "Line–plane angle", "0 °");
  await clearSelection(page);
  await chooseTool(page, "undo", "undo");
  assert.equal(await page.getByRole("region", { name: "Measurements" }).isVisible(), false);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, original);
  await sketchMeasurements(page, name);
  console.log(
    `${name}: real face/face, edge/edge, mixed and sketch selection measurements, witness navigation, clear and Undo/Redo passed`,
  );
}

async function sketchMeasurements(page, name) {
  // A fresh sketch proves plane-based line angles and typed edits update the readout.
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-10, -4], [10, -4]);
  await drag(page, [-10, 4], [10, 4]);
  await page.keyboard.press("Escape");
  const a = await at(page, -4, -4),
    b = await at(page, -4, 4);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  await readout(page, "Maximum gap", "8 mm");
  await readout(page, "Line angle", "0 °");
  const constraints = page.getByRole("group", { name: "Selected entity constraints" });
  const measurements = page.getByRole("region", { name: "Measurements" });
  const constraintBox = await constraints.boundingBox(),
    measurementBox = await measurements.boundingBox();
  assert.ok(constraintBox && measurementBox);
  assert.ok(
    constraintBox.y + constraintBox.height + 7 <= measurementBox.y,
    "Constraints and measurements share a nonoverlapping stack",
  );
  await constraints.getByRole("button", { name: "Constrain parallel", exact: true }).click();
  await inspect(page);
  assert.ok(
    await constraints
      .getByRole("button", { name: "Remove Parallel constraint", exact: true })
      .isVisible(),
  );
  await readout(page, "Maximum gap", "8 mm");
  await page.screenshot({ path: `.cache/sketch-review/${name}-measurement-constraints.png` });
  if (name !== "electron") {
    await page.setViewportSize({ width: 1280, height: 400 });
    const camera = (await inspect(page)).camera;
    const stack = await page.locator(".selection-readouts").boundingBox();
    assert.ok(stack);
    await page.mouse.move(stack.x + 150, stack.y + 50);
    await page.mouse.wheel(0, 220);
    await page.waitForFunction(() => document.querySelector(".selection-readouts").scrollTop > 0);
    assert.deepEqual(
      (await inspect(page)).camera,
      camera,
      "Scrolling the cards does not pan the model",
    );
  }
}
