import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Face } from "../src/model/body.js";
import { OffsetPlacement } from "../src/model/offset-placement.js";

function cylinder(outward: 1 | -1 = 1): Face {
  const vertices: number[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      b = ((i + 1) * Math.PI) / 36;
    vertices.push(
      10 * Math.cos(a),
      10 * Math.sin(a),
      0,
      10 * Math.cos(b),
      10 * Math.sin(b),
      0,
      10 * Math.cos(a),
      10 * Math.sin(a),
      10,
    );
  }
  return {
    id: "wall",
    edges: [],
    signature: [],
    vertices,
    plane: null,
    cylinder: { origin: [0, 0, 0], axis: [0, 0, 1], radius: 10, outward },
  };
}
function camera(angle: number, height = 0.2) {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(Math.cos(angle), Math.sin(angle), height);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
test("Cylinder offset stays readable through orbit, retains its side under jitter, and reacquires after hiding", () => {
  for (const outward of [1, -1] as const) {
    const placement = new OffsetPlacement(),
      face = cylinder(outward);
    const first = placement.choose(face, camera(0));
    assert.ok(first);
    for (const angle of [0.01, -0.01, 0.03, -0.03, 0])
      assert.equal(placement.choose(face, camera(angle)), first);
    for (let angle = 0; angle < 2 * Math.PI; angle += 0.05) {
      const view = camera(angle),
        frame = placement.choose(face, view);
      assert.ok(frame);
      const normal = new THREE.Vector3(...frame.normal);
      const facing = normal.dot(view.getWorldDirection(new THREE.Vector3()).negate());
      assert.ok(facing >= 0 && facing < 0.56, `visible and readable: ${facing}`);
      assert.ok(Math.abs(Math.hypot(frame.center[0], frame.center[1]) - 10) < 1e-9);
    }
    assert.notEqual(placement.choose({ ...face }, camera(0)), first, "new geometry resets memory");
  }
});
test("Axial views remain stable and plane/blend frames remain geometry-owned", () => {
  const placement = new OffsetPlacement(),
    face = cylinder();
  const top = camera(0, 1e10);
  const first = placement.choose(face, top);
  for (const angle of [1, 2, 3, 4, 5, 6])
    assert.equal(placement.choose(face, camera(angle, 1e10)), first);
  assert.equal(placement.choose({ ...face, cylinder: null }, top), null);
  assert.equal(
    placement.choose({ ...face, blend: { radius: 2, outward: 1, faces: [] } }, top),
    null,
  );
});
