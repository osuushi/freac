import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { orbitPivot } from "../src/sketch/orbit-pivot.js";
import { nearestOrbitSurface } from "../src/sketch/orbit-surface.js";
import { planes } from "../src/sketch/planes.js";

function camera() {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(100, 200, 120);
  camera.lookAt(100, 200, 0);
  camera.updateMatrixWorld();
  return camera;
}
function surface(x0: number, y0: number, x1: number, y1: number, z: number): Body {
  return {
    id: `${x0}:${y0}:${z}`,
    brep: "",
    volume: 0,
    center: [(x0 + x1) / 2, (y0 + y1) / 2, z],
    bounds: [x0, y0, z, x1, y1, z],
    edges: [],
    faces: [
      {
        id: "f",
        edges: [],
        signature: [],
        plane: null,
        vertices: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z],
      },
    ],
  };
}
function close(point: THREE.Vector3 | null, xyz: number[]) {
  assert.ok(
    point && point.distanceTo(new THREE.Vector3(...xyz)) < 1e-4,
    `${point?.toArray()} != ${xyz}`,
  );
}
test("press ray chooses frontmost surface point, not its center or a tessellation average", () => {
  const front = surface(50, 150, 150, 250, 30),
    back = surface(50, 150, 150, 250, -40);
  close(
    nearestOrbitSurface(camera(), [back, front], new THREE.Vector2(0.2, -0.3), 1, []),
    [110, 185, 30],
  );
});
test("empty-space press uses the nearest projected surface and resolves occlusion with a ray", () => {
  const back = surface(120, 190, 140, 210, -30),
    front = surface(120, 188, 145, 215, 40);
  for (const bodies of [
    [back, front],
    [front, back],
  ])
    close(nearestOrbitSurface(camera(), bodies, new THREE.Vector2(), 1, []), [120, 200, 40]);
});
test("nearest is measured in screen pixels, including wide viewports", () => {
  const c = camera();
  c.left = -200;
  c.right = 200;
  c.updateProjectionMatrix();
  const x = surface(125, 195, 130, 205, 0),
    y = surface(95, 210, 105, 215, 0);
  close(nearestOrbitSurface(c, [x, y], new THREE.Vector2(), 4, []), [100, 210, 0]);
});
test("holes do not attract rays to empty box interiors", () => {
  const frame = [
    surface(80, 180, 95, 220, 30),
    surface(105, 180, 120, 220, 30),
    surface(95, 180, 105, 195, 30),
    surface(95, 205, 105, 220, 30),
  ];
  const hit = nearestOrbitSurface(camera(), frame, new THREE.Vector2(), 1, []);
  assert.ok(hit && Math.abs(hit.distanceTo(new THREE.Vector3(100, 200, 30)) - 5) < 1e-4);
  close(
    nearestOrbitSurface(
      camera(),
      [...frame, surface(97, 197, 103, 203, -20)],
      new THREE.Vector2(),
      1,
      [],
    ),
    [100, 200, -20],
  );
});
test("clipped portions and offscreen surfaces cannot attract the pivot", () => {
  const visible = surface(110, 190, 140, 210, 30),
    offscreen = surface(151, 195, 160, 205, 60);
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), -125);
  close(
    nearestOrbitSurface(camera(), [visible, offscreen], new THREE.Vector2(), 1, [clip]),
    [125, 200, 30],
  );
  assert.equal(nearestOrbitSurface(camera(), [offscreen], new THREE.Vector2(), 1, []), null);
  const back = surface(50, 150, 150, 250, -40);
  close(
    nearestOrbitSurface(camera(), [visible, back], new THREE.Vector2(0.4, 0), 1, [
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0),
    ]),
    [120, 200, -40],
  );
});
function editor(bodies: Body[] = []) {
  return {
    world: {
      camera: camera(),
      target: new THREE.Vector3(100, 200, 0),
      height: 100,
      canvas: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 1000, height: 1000 }) },
      renderer: { clippingPlanes: [] },
    },
    display: { sketches: [], bodies },
    bodiesVisible: true,
    visibility: { visible: () => true },
    modeling: {
      targets: [{ kind: "body", body: "unrelated-selected" }],
      hover: { kind: "body", body: "stale-hover" },
    },
  } as unknown as SketchEditor;
}
test("mouse/touch coordinates drive acquisition without hover or selection; hidden bodies are excluded", () => {
  const e = editor([surface(50, 150, 150, 250, 30)]);
  close(orbitPivot(e, { x: 610, y: 670 }), [110, 185, 30]);
  e.bodiesVisible = false;
  close(orbitPivot(e, { x: 610, y: 670 }), [100, 200, 0]);
});
test("wire-only fallback uses the closest visible curve point and empty views keep the target", () => {
  const e = editor();
  Object.defineProperty(e, "display", {
    value: {
      sketches: [
        {
          id: "s",
          plane: planes.XY,
          groups: [],
          constraints: [],
          curves: [
            {
              id: "c",
              kind: "segment",
              construction: false,
              a: { x: 80, y: 195 },
              b: { x: 130, y: 195 },
            },
          ],
        },
      ],
    },
  });
  close(orbitPivot(e, { x: 610, y: 670 }), [110, 195, 0]);
  close(orbitPivot(editor(), { x: 610, y: 670 }), [100, 200, 0]);
});

test("an edge-on face cannot hide the nearest actual surface from empty-space search", () => {
  const edgeOn = surface(105, 190, 105, 210, 0);
  const wall = {
    ...edgeOn,
    bounds: [105, 190, 0, 105, 210, 10],
    faces: [{ ...edgeOn.faces[0], vertices: [105, 190, 0, 105, 210, 0, 105, 210, 10] }],
  };
  close(
    nearestOrbitSurface(
      camera(),
      [wall, surface(110, 190, 120, 210, 0)],
      new THREE.Vector2(),
      1,
      [],
    ),
    [110, 200, 0],
  );
});
