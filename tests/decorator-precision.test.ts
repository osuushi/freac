import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cylinderCoordinates, cylinderFrame } from "../src/decorators/cylinder.js";
import { threadTolerance } from "../src/decorators/precision.js";
import { threadMeshes, threadRadius } from "../src/decorators/thread-mesh.js";
import { threadDefaults, threadDefinition } from "../src/decorators/thread-settings.js";
import { documentArchive } from "../src/model/document-archive.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes, type Vector } from "../src/sketch/planes.js";
import { lift } from "./body-edge-fixtures.js";

async function cylinder(owner: DocumentOwner) {
  return lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", radius: 5, center: { x: 0, y: 0 }, construction: false },
    ],
  });
}

test("decorated export refines the BRep snapshot without touching the document or Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await cylinder(owner);
    const support = body.faces.find((f) => f.cylinder);
    assert.ok(support);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: threadDefinition,
            faces: [{ body: body.id, face: support.id }],
            settings: { clearance: 0.02 },
          },
        })
      ).error,
      undefined,
    );
    const before = documentArchive(owner.view.data);
    const history = (await owner.call({ kind: "read-history" })).history;
    const reply = await owner.call({ kind: "export-geometry" });
    assert.equal(reply.error, undefined);
    const refined = reply.exportDocument?.bodies?.[0];
    assert.ok(refined);
    assert.equal(refined.brep, body.brep);
    assert.deepEqual(
      refined.faces.map((f) => f.id),
      body.faces.map((f) => f.id),
    );
    const face = refined.faces.find((f) => f.id === support.id);
    assert.ok(face);
    assert.ok(face.vertices.length > support.vertices.length);
    let deviation = 0;
    for (let i = 0; i < face.vertices.length; i += 9)
      for (const [a, b] of [
        [0, 3],
        [3, 6],
        [6, 0],
      ]) {
        const x = (face.vertices[i + a] + face.vertices[i + b]) / 2;
        const y = (face.vertices[i + a + 1] + face.vertices[i + b + 1]) / 2;
        deviation = Math.max(deviation, Math.abs(5 - Math.hypot(x, y)));
      }
    assert.ok(deviation <= 0.0025, `Base cylinder deviation ${deviation} mm`);
    assert.equal(documentArchive(owner.view.data), before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
  } finally {
    owner.close();
  }
});

test("sampled thread facets preserve the analytic crest/root profile within the sampling budget", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await cylinder(owner),
      face = body.faces.find((f) => f.cylinder);
    assert.ok(face?.cylinder);
    const frame = cylinderFrame(face.cylinder);
    for (const profile of ["metric", "rounded"] as const)
      for (const hand of ["right", "left"] as const) {
        const settings = {
          ...threadDefaults(10),
          profile,
          hand,
          start: 1,
          end: 2,
          startTaper: 0.2,
          endTaper: 0.7,
        };
        const geometry = threadMeshes(frame, [face], settings);
        assert.ok(geometry);
        const mesh = geometry.fill;
        validateMesh(mesh);
        const half = mesh.vertices.length / 2;
        let deviation = 0;
        for (const triangle of mesh.triangles) {
          if (triangle.some((i) => i < half)) continue;
          const points = triangle.map((i) => mesh.vertices[i]);
          for (const weights of [
            [1 / 3, 1 / 3, 1 / 3],
            [0.5, 0.5, 0],
            [0, 0.5, 0.5],
            [0.5, 0, 0.5],
          ]) {
            const p = [0, 1, 2].map((axis) =>
              points.reduce((sum, point, i) => sum + point[axis] * weights[i], 0),
            ) as Vector;
            const { angle, z } = cylinderCoordinates(frame, p);
            const expected = threadRadius(5, angle, z, settings, 1, [1, 8]);
            deviation = Math.max(deviation, Math.abs(Math.hypot(p[0], p[1]) - expected));
          }
        }
        assert.ok(
          deviation <= threadTolerance(settings) * 2,
          `${profile} ${hand} facet deviation ${deviation} mm`,
        );
      }
  } finally {
    owner.close();
  }
});
