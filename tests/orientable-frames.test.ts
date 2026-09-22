import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Edge } from "../src/model/body.js";
import { edgeSectionWidth } from "../src/model/edge-finish-direction.js";
import { cameraFacingWidth } from "../src/model/widget-frame.js";
import type { Vector } from "../src/sketch/planes.js";

function view(position: Vector) {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}
test("Axial tool roll keeps its width screen-facing without changing its operation axis", () => {
  const normal: Vector = [0, 0, 1];
  for (const position of [
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0.2],
    [1, 0, 10],
    [0, 0, 1],
    [0, 0, -1],
  ] as Vector[]) {
    const camera = view(position);
    const width = new THREE.Vector3(...cameraFacingWidth(camera, normal));
    near(width.length(), 1);
    near(width.z, 0);
    near(width.dot(camera.getWorldDirection(new THREE.Vector3())), 0);
    const screen = width.applyQuaternion(camera.quaternion.clone().invert());
    near(Math.hypot(screen.x, screen.y), 1);
  }
});
test("Fillet and chamfer sections follow a circular edge at the closest edge point", () => {
  const edge: Edge = {
    id: "rim",
    signature: [],
    points: [],
    curve: {
      kind: "circle",
      center: [0, 0, 0],
      normal: [0, 0, 1],
      radius: 10,
    },
  };
  for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const outward = radial
      .clone()
      .add(new THREE.Vector3(0, 0, 1))
      .normalize();
    const anchor = radial.clone().multiplyScalar(10).toArray() as Vector;
    const width = new THREE.Vector3(...edgeSectionWidth(edge, anchor, outward.toArray() as Vector));
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    near(width.dot(outward), 0);
    near(width.dot(tangent), 0);
    near(width.length(), 1);
    near(Math.abs(width.dot(radial)), Math.SQRT1_2);
  }
});
test("Straight and sampled edge sections use their local tangent rather than world axes", () => {
  const outward: Vector = [0, 0, 1];
  const line: Edge = {
    id: "line",
    signature: [],
    points: [],
    curve: {
      kind: "line",
      a: [0, 0, 0],
      b: [10, 10, 0],
    },
  };
  const width = new THREE.Vector3(...edgeSectionWidth(line, [5, 5, 0], outward));
  near(width.x, Math.SQRT1_2);
  near(width.y, -Math.SQRT1_2);
  const sampled: Edge = {
    id: "sampled",
    signature: [],
    curve: null,
    points: [0, 0, 0, 10, 0, 0, 10, 10, 0],
  };
  assert.deepEqual(edgeSectionWidth(sampled, [10, 8, 0], outward), [1, 0, 0]);
});
