import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import { faceRayHits } from "../src/model/body-ray-hits.js";
import { coplanar, type PlaneFrame, validateFrame } from "../src/sketch/planes.js";
import { flipSectionFrame, sectionClip } from "../src/sketch/view-clipping.js";

test("Flip reverses an oblique section without changing its plane or origin", () => {
  const frame: PlaneFrame = { origin: [3, -8, 7], u: [0.6, 0.8, 0], v: [0, 0, 1] };
  const flipped = flipSectionFrame(frame);
  validateFrame(flipped);
  assert.deepEqual(flipped.origin, frame.origin);
  assert.ok(coplanar(frame, flipped));
  const before = sectionClip(frame),
    after = sectionClip(flipped);
  for (const point of [
    [3, -8, 7],
    [6, -8, 7],
    [-10, 4, 2],
  ]) {
    const p = new THREE.Vector3(...point);
    assert.ok(Math.abs(before.distanceToPoint(p) + after.distanceToPoint(p)) < 1e-9);
  }
  assert.deepEqual(flipSectionFrame(flipped), frame);
});

test("Face picking skips clipped triangles and finds the retained face", () => {
  const body: Body = {
    id: "body",
    brep: "",
    bounds: [],
    volume: 0,
    center: [0, 0, 0],
    edges: [],
    faces: [1, -1].map((z) => ({
      id: `face-${z}`,
      signature: [],
      plane: null,
      edges: [],
      vertices: [-5, -5, z, 5, -5, z, 0, 5, z],
    })),
  };
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1));
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  assert.deepEqual(
    faceRayHits([body], ray, ray.origin, [plane]).map((h) => h.face),
    ["face--1"],
  );
  assert.deepEqual(
    faceRayHits([body], ray, ray.origin, [plane.negate()]).map((h) => h.face),
    ["face-1"],
  );
});
