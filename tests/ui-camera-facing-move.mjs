import assert from "node:assert/strict";
import * as THREE from "three";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cameraFacingMove(page, project, body) {
  const from = project.point(body.center);
  const to = { x: from.x - 35, y: from.y + 20 };
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(...body.center),
  );
  const first = project.ray(from).intersectPlane(plane, new THREE.Vector3());
  const last = project.ray(to).intersectPlane(plane, new THREE.Vector3());
  const expected = new THREE.Vector3(...body.center).add(last.sub(first));
  await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const moved = (await inspect(page)).document.bodies[0];
  assert.ok(expected.distanceTo(new THREE.Vector3(...moved.center)) < 1e-5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.bodies[0], body);
}
