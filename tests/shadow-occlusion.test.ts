import assert from "node:assert/strict";
import test from "node:test";
import { clipShadowOccluder } from "../src/model/shadow-occlusion.js";
import type { Vector } from "../src/sketch/planes.js";

test("Only triangles between the camera and receiver occlude, on all planes and camera sides", () => {
  for (const axis of [0, 1, 2])
    for (const direction of [-1, 1]) {
      const triangle: Vector[] = [
        [1, 1, 1],
        [2, 1, 1],
        [1, 2, 1],
      ];
      for (const p of triangle) p[axis] = -direction * 4;
      assert.deepEqual(clipShadowOccluder(triangle, axis, direction), triangle);
      assert.deepEqual(clipShadowOccluder(triangle, axis, -direction), []);
    }
});

test("A triangle crossing a receiver masks only its foreground portion", () => {
  const triangle: Vector[] = [
    [-2, -1, 4],
    [2, -1, 4],
    [2, 3, 4],
  ];
  const original = structuredClone(triangle);
  assert.deepEqual(clipShadowOccluder(triangle, 0, -1), [
    [0, -1, 4],
    [2, -1, 4],
    [2, 3, 4],
    [0, 1, 4],
  ]);
  assert.deepEqual(clipShadowOccluder(triangle, 0, 1), [
    [-2, -1, 4],
    [0, -1, 4],
    [0, 1, 4],
  ]);
  assert.deepEqual(triangle, original);
});

test("Coplanar solids occlude their footprint; edge-on receivers have no area", () => {
  const triangle: Vector[] = [
    [1, 0, 0],
    [2, 0, 0],
    [1, 2, 0],
  ];
  assert.deepEqual(clipShadowOccluder(triangle, 2, -1), triangle);
  assert.deepEqual(clipShadowOccluder(triangle, 2, 0), []);
});
