import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  composeMovement,
  movementIsIdentity,
  movementRequest,
  type TopologyMovement,
} from "../src/model/topology-movement.js";
import type { Vector } from "../src/sketch/planes.js";

const base: TopologyMovement = {
  faces: [{ body: "body", face: "cap" }],
  bodyIds: ["whole-body"],
  pivot: [1, 2, 3],
  axis: [0, 0, 1],
  angle: 90,
  translation: [4, 0, 0],
};

function point(edit: TopologyMovement, input: Vector, expected: Vector): void {
  const actual = new THREE.Vector3(...input)
    .sub(new THREE.Vector3(...edit.pivot))
    .applyAxisAngle(new THREE.Vector3(...edit.axis), (edit.angle * Math.PI) / 180)
    .add(new THREE.Vector3(...edit.pivot))
    .add(new THREE.Vector3(...edit.translation));
  assert.ok(actual.distanceTo(new THREE.Vector3(...expected)) < 1e-10, `${actual.toArray()}`);
}

test("world translations retain rotation, preceding axes and mixed targets", () => {
  const moved = composeMovement(base, base.pivot, [1, 0, 0], false, 2);
  const next = composeMovement(moved, base.pivot, [0, 1, 0], false, -3);
  point(next, [2, 2, 3], [7, 0, 3]);
  assert.ok("faces" in next);
  assert.deepEqual(next.faces, base.faces);
  assert.deepEqual(next.bodyIds, base.bodyIds);
  assert.deepEqual(base.translation, [4, 0, 0], "Earlier previews remain immutable");
  assert.equal(composeMovement(next, base.pivot, [0, 0, 1], false, 0), next);
  assert.equal(movementIsIdentity(next), false);
});

test("rotations compose in gesture order around the current world pivot", () => {
  const rotated = composeMovement(base, [0, 0, 0], [0, 1, 0], true, 90);
  point(rotated, [2, 2, 3], [3, 3, -5]);
  point(rotated, [1, 2, 3], [3, 2, -5]);
});

test("rotation after translation retains displacement and respects a relocated pivot", () => {
  const translated = {
    ...base,
    pivot: [0, 0, 0] as Vector,
    angle: 0,
    translation: [2, 3, 0] as Vector,
  };
  point(composeMovement(translated, [0, 0, 0], [0, 0, 1], true, 90), [1, 0, 0], [-3, 3, 0]);
  point(composeMovement(translated, [5, 5, 0], [0, 0, 1], true, 90), [1, 0, 0], [7, 3, 0]);
});

test("inverse gestures and full turns are aggregate identities", () => {
  const identity = { ...base, angle: 0, translation: [0, 0, 0] as Vector };
  const rotated = composeMovement(identity, base.pivot, base.axis, true, 90);
  const restored = composeMovement(rotated, base.pivot, base.axis, true, -90);
  assert.equal(movementIsIdentity(restored), true);
  assert.equal(
    movementIsIdentity(composeMovement(identity, base.pivot, base.axis, true, 360)),
    true,
  );
  const moved = composeMovement(rotated, base.pivot, [1, 0, 0], false, 2);
  assert.equal(movementIsIdentity(composeMovement(moved, base.pivot, [1, 0, 0], false, -2)), false);
});

test("edge handles retain preceding axes through the translation-only request", () => {
  const edge: TopologyMovement = {
    edges: [{ body: "body", edge: "rim" }],
    bodyIds: ["whole-body"],
    pivot: [0, 0, 0],
    axis: [1, 0, 0],
    angle: 0,
    translation: [0, 0, 2],
  };
  const moved = composeMovement(edge, edge.pivot, [1, 0, 0], false, 3);
  assert.deepEqual(movementRequest(moved), {
    kind: "move-edges",
    operation: { edges: edge.edges, bodyIds: edge.bodyIds, translation: [3, 0, 2] },
  });
});
