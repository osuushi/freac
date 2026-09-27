import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import type { Sketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { orbitPivot } from "../src/sketch/orbit-pivot.js";
import { visibleOrbitCenter } from "../src/sketch/orbit-sampling.js";
import { planes } from "../src/sketch/planes.js";

function camera() {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(100, 200, 120);
  camera.lookAt(100, 200, 0);
  camera.updateMatrixWorld();
  return camera;
}
function surface(z: number): Body {
  return {
    id: `b${z}`,
    brep: "",
    volume: 0,
    center: [100, 200, z],
    bounds: [50, 150, z, 150, 250, z],
    edges: [],
    faces: [
      {
        id: `f${z}`,
        edges: [],
        signature: [],
        plane: null,
        vertices: [50, 150, z, 150, 150, z, 150, 250, z, 50, 150, z, 150, 250, z, 50, 250, z],
      },
    ],
  };
}
test("central sampling finds the nearest surface away from the origin, independent of triangle count", () => {
  const back = surface(-40),
    front = surface(30);
  const center = visibleOrbitCenter(camera(), [back, front], [], () => true);
  assert.ok(center && center.distanceTo(new THREE.Vector3(100, 200, 30)) < 1e-8);
  const dense = { ...back, faces: [...back.faces, ...back.faces, ...back.faces] };
  assert.ok(visibleOrbitCenter(camera(), [dense, front], [], () => true)?.distanceTo(center) === 0);
});
test("clipped surfaces are excluded and empty central view has no invented pivot", () => {
  const center = visibleOrbitCenter(camera(), [surface(30), surface(-40)], [], (p) => p.z < 0);
  assert.ok(center && Math.abs(center.z + 40) < 1e-8);
  assert.equal(
    visibleOrbitCenter(camera(), [], [], () => true),
    null,
  );
});
test("a long sketch edge crossing the center is found even with both endpoints outside", () => {
  const sketch: Sketch = {
    id: "s",
    plane: planes.XY,
    groups: [],
    constraints: [],
    curves: [
      {
        id: "c",
        kind: "segment",
        construction: false,
        a: { x: 20, y: 200 },
        b: { x: 180, y: 200 },
      },
    ],
  };
  const center = visibleOrbitCenter(camera(), [], [sketch], () => true);
  assert.ok(center && center.distanceTo(new THREE.Vector3(100, 200, 0)) < 1e-8);
  assert.equal(
    visibleOrbitCenter(
      camera(),
      [],
      [{ ...sketch, plane: { ...planes.XY, origin: [0, 100, 0] } }],
      () => true,
    ),
    null,
  );
});

test("selected sketches use their combined bounds, not the bounds of their centers", () => {
  const sketches: Sketch[] = [
    {
      id: "small",
      plane: planes.XY,
      groups: [],
      constraints: [],
      curves: [
        { id: "a", kind: "segment", construction: false, a: { x: 10, y: 2 }, b: { x: 20, y: 4 } },
      ],
    },
    {
      id: "large",
      plane: planes.XY,
      groups: [],
      constraints: [],
      curves: [
        { id: "b", kind: "segment", construction: false, a: { x: 50, y: 6 }, b: { x: 150, y: 8 } },
      ],
    },
  ];
  const editor = {
    world: { active: null },
    store: { data: { sketches } },
    modeling: { targets: sketches.map((s) => ({ kind: "sketch", sketch: s.id })) },
  } as unknown as SketchEditor;
  assert.deepEqual(orbitPivot(editor).toArray(), [80, 5, 0]);
});

test("face and body multiselection includes actual bounds, not body centers", () => {
  const first = surface(30),
    second = surface(-40);
  const editor = {
    world: { active: null },
    store: { data: { sketches: [], bodies: [first, second] } },
    modeling: {
      targets: [
        { kind: "body", body: first.id },
        { kind: "face", body: second.id, face: second.faces[0].id },
      ],
    },
  } as unknown as SketchEditor;
  assert.deepEqual(orbitPivot(editor).toArray(), [100, 200, -5]);
});

test("thin vertical edges between ray columns remain discoverable in a wide viewport", () => {
  const view = camera();
  view.left = -100;
  view.right = 100;
  view.updateProjectionMatrix();
  const x = 100 + 20 / 21;
  const sketch: Sketch = {
    id: "s",
    plane: planes.XY,
    groups: [],
    constraints: [],
    curves: [{ id: "c", kind: "segment", construction: false, a: { x, y: 170 }, b: { x, y: 230 } }],
  };
  const center = visibleOrbitCenter(view, [], [sketch], () => true);
  assert.ok(center && center.distanceTo(new THREE.Vector3(x, 200, 0)) < 1e-5);
});
