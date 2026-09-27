import assert from "node:assert/strict";
import * as THREE from "three";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

function projected(camera, point) {
  const forward = new THREE.Vector3(...camera.position)
    .sub(new THREE.Vector3(...camera.target))
    .normalize();
  const up = new THREE.Vector3(...camera.up);
  const right = up.clone().cross(forward).normalize();
  const delta = new THREE.Vector3(...point).sub(new THREE.Vector3(...camera.target));
  return [delta.dot(right), delta.dot(up)];
}
async function checkDrag(page, expected, cube = false) {
  const before = await inspect(page);
  const box = await page.locator(cube ? ".orientation-cube" : "canvas").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height * (cube ? 0.5 : 0.85);
  await page.mouse.move(x, y);
  if (!cube) await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + 25, y - 20, { steps: 4 });
  const during = await inspect(page);
  assert.equal(during.camera.orbitActive, true);
  during.camera.orbitPivot.forEach((value, i) => {
    assert.ok(
      Math.abs(value - expected[i]) < 0.02,
      `pivot ${during.camera.orbitPivot} expected ${expected}`,
    );
  });
  const a = projected(before.camera, expected),
    b = projected(during.camera, expected);
  a.forEach((value, i) => {
    assert.ok(Math.abs(value - b[i]) < 0.02, "Pivot stays at its original screen position");
  });
  await page.mouse.move(x, y);
  const returned = await inspect(page);
  returned.camera.position.forEach((value, i) => {
    assert.ok(Math.abs(value - before.camera.position[i]) < 1e-7);
  });
  returned.camera.target.forEach((value, i) => {
    assert.ok(Math.abs(value - before.camera.target[i]) < 1e-7);
  });
  await page.mouse.up();
  if (!cube) await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).document, before.document);
}
export async function orbitPivotRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [20, 10], [40, 20]);
  await checkDrag(page, [30, 15, 0]);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const endpoint = await at(page, 20, 10);
  await page.mouse.click(endpoint.x, endpoint.y);
  assert.ok((await inspect(page)).selectionTargets.some((t) => t.kind !== "curve"));
  await checkDrag(page, [20, 10, 0]);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await checkDrag(page, [30, 15, 0], true);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await page.mouse.move(800, 600);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(250, 600, { steps: 5 });
  await page.mouse.up({ button: "right" });
  const target = (await inspect(page)).camera.target;
  const lineY = Math.round(target[1]) + 2;
  await page.keyboard.press("l");
  await page.keyboard.down("Shift");
  await drag(page, [target[0] - 30, lineY], [target[0] + 30, lineY]);
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).selectionTargets.length, 0);
  await checkDrag(page, [target[0], lineY, 0]);
  console.log(
    `${name}: off-origin rectangle, explicit point, cube selection and unselected central wire pivots preserve framing and geometry`,
  );
}

export async function surfacePivotRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-16, -16], [16, 16]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("12");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await checkDrag(page, [0, 0, 6]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  await checkDrag(page, [0, 0, 12]);
  console.log(
    `${name}: real extruded body uses selected volume bounds and unselected front-surface depth`,
  );
}
