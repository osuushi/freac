import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { edgeFacesCamera, faceRayHits } from "../src/model/body-ray-hits.js";
import { emptySketch } from "../src/sketch/document.js";
import { projectedPlaneBounds } from "../src/sketch/plane-bounds.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

test("reference patches extend every side of the projected bounding box by 20%", () => {
  assert.deepEqual(
    projectedPlaneBounds(planes.XY, [
      [-50, -100, -30],
      [150, 100, 40],
    ]),
    { minX: -90, maxX: 190, minY: -140, maxY: 140 },
  );
  assert.deepEqual(projectedPlaneBounds(planes.XY, []), {
    minX: -20,
    maxX: 20,
    minY: -20,
    maxY: 20,
  });
});
test("exact box topology excludes back faces and back/back edges, retains silhouettes", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const camera = new THREE.Vector3(50, -60, 70),
      direction = new THREE.Vector3(-1, 1, -1).normalize();
    const center = new THREE.Vector3(10, 10, 5);
    const ray = new THREE.Ray(center.clone().addScaledVector(direction, -100), direction);
    const hits = faceRayHits([body], ray, camera);
    assert.equal(hits.length, 1, "Entry face only; exit back face is excluded");
    let silhouettes = 0,
      hidden = 0;
    for (const edge of body.edges) {
      const point = new THREE.Vector3()
        .fromArray(edge.points)
        .add(new THREE.Vector3().fromArray(edge.points, edge.points.length - 3))
        .multiplyScalar(0.5);
      const faces = body.faces.filter((f) => f.edges.includes(edge.id));
      const front = faces.filter(
        (f) =>
          new THREE.Triangle(
            new THREE.Vector3().fromArray(f.vertices),
            new THREE.Vector3().fromArray(f.vertices, 3),
            new THREE.Vector3().fromArray(f.vertices, 6),
          )
            .getNormal(new THREE.Vector3())
            .dot(direction) < 0,
      );
      assert.equal(edgeFacesCamera(body, edge.id, point.toArray(), direction), front.length > 0);
      if (front.length === 1) silhouettes++;
      if (front.length === 0) hidden++;
    }
    assert.ok(silhouettes > 0 && hidden > 0);
  } finally {
    owner.close();
  }
});

test("curved edge eligibility uses the adjacent local normal", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
      ],
    });
    const bottom = body.edges.find(
      (edge) =>
        edge.points.length > 9 && edge.points.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-6),
    );
    assert.ok(bottom);
    const direction = new THREE.Vector3(0, 1, -1).normalize();
    assert.equal(edgeFacesCamera(body, bottom.id, [0, -5, 0], direction), true);
    assert.equal(edgeFacesCamera(body, bottom.id, [0, 5, 0], direction), false);
  } finally {
    owner.close();
  }
});

test("occlusion retains another body's front face, never its exit face", async () => {
  const owner = new DocumentOwner();
  try {
    const front = await prism(owner, square);
    const rear = await lift(owner, {
      ...emptySketch({ ...planes.XY, origin: [0, 0, -20] }),
      curves: structuredClone(owner.view.data.sketches[0].curves),
    });
    const camera = new THREE.Vector3(10, 10, 100);
    const hits = faceRayHits(
      [rear, front],
      new THREE.Ray(camera, new THREE.Vector3(0, 0, -1)),
      camera,
    );
    assert.deepEqual(
      hits.map((hit) => hit.body),
      [front.id, rear.id],
    );
    assert.equal(hits.length, 2);
  } finally {
    owner.close();
  }
});
