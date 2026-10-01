import assert from "node:assert/strict";
import test from "node:test";
import { type ExportMesh, validateMesh } from "../src/model/export-mesh.js";

const tetrahedron: ExportMesh = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  triangles: [
    [0, 2, 1],
    [0, 1, 3],
    [1, 2, 3],
    [2, 0, 3],
  ],
};

test("export validation retains closure, orientation and edge multiplicity checks", () => {
  validateMesh(tetrahedron);
  assert.throws(
    () => validateMesh({ ...tetrahedron, triangles: tetrahedron.triangles.slice(1) }),
    /closed/,
  );
  assert.throws(
    () =>
      validateMesh({
        ...tetrahedron,
        triangles: tetrahedron.triangles.map((t, i) => (i ? t : [...t].reverse())),
      }),
    /oriented/,
  );
  assert.throws(
    () =>
      validateMesh({
        ...tetrahedron,
        triangles: [...tetrahedron.triangles, ...tetrahedron.triangles],
      }),
    /closed/,
  );
});

test("export validation rejects collinear and nonfinite facets", () => {
  for (const point of [
    [0, 0, 0],
    [2, 0, 0],
    [NaN, 0, 0],
    [Infinity, 0, 0],
  ]) {
    assert.throws(
      () =>
        validateMesh({
          ...tetrahedron,
          vertices: [
            tetrahedron.vertices[0],
            tetrahedron.vertices[1],
            point,
            tetrahedron.vertices[3],
          ],
        }),
      /degenerate/,
    );
  }
});
