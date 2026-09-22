import assert from "node:assert/strict";
import * as THREE from "three";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cylinderSeamRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const body = (await inspect(page)).document.bodies[0];
  assert.equal(body.faces.length, 3);
  assert.equal(body.edges.length, 3);
  const seam = body.edges.find((e) => e.curve?.kind === "line");
  assert.ok(seam);
  const midpoint = [0, 1, 2].map((i) => (seam.points[i] + seam.points[i + 3]) / 2);
  const before = (await inspect(page)).camera;
  const offset = new THREE.Vector3(...before.position).sub(new THREE.Vector3(...before.target));
  const azimuth = Math.atan2(-before.up[1], -before.up[0]);
  const yaw = Math.atan2(midpoint[1], midpoint[0]);
  const polar = Math.acos(offset.z / offset.length());
  await page.mouse.move(1000, 650);
  await page.keyboard.down("Alt");
  await page.mouse.wheel((yaw - azimuth) / 0.007, (polar - 1.2) / 0.007);
  await page.keyboard.up("Alt");
  const { camera } = await inspect(page);
  const box = await page.locator("canvas").boundingBox();
  const h = camera.height / 2,
    w = (h * box.width) / box.height;
  const view = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  const p = new THREE.Vector3(...midpoint).project(view);
  await page.mouse.move(box.x + ((p.x + 1) * box.width) / 2, box.y + ((1 - p.y) * box.height) / 2);
  assert.equal(
    (await inspect(page)).modelingHover,
    "face",
    "Native seam must not intercept face hover",
  );
  await page.mouse.down();
  await page.mouse.up();
  const selected = (await inspect(page)).modelingSelection;
  assert.equal(selected[0]?.kind, "face");
  assert.equal(selected[0].face, body.faces.find((f) => !f.plane).id);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cylinder-seam.png` });
}
