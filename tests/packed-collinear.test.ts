import assert from "node:assert/strict";
import test from "node:test";
import { type ExportMesh, validateMesh } from "../src/model/export-mesh.js";
import { packedMesh } from "../src/model/packed-mesh.js";

test("packing re-triangulates an exact collinear facet without moving any vertex or opening the shell", () => {
  const mesh: ExportMesh = {
    vertices: [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
      [1, 0, 0],
    ],
    triangles: [
      [0, 2, 1],
      [0, 4, 3],
      [4, 1, 3],
      [1, 2, 3],
      [2, 0, 3],
      [0, 1, 4],
    ],
  };
  assert.throws(() => validateMesh(mesh));
  const result = packedMesh(mesh, 1e-7);
  validateMesh(result);
  assert.deepEqual(result.vertices, mesh.vertices);
  assert.equal(result.triangles.length, mesh.triangles.length);
  assert.ok(result.triangles.some((t) => t.includes(4) && t.includes(2) && t.includes(0)));
  assert.ok(result.triangles.some((t) => t.includes(4) && t.includes(2) && t.includes(1)));
  assert.deepEqual(mesh.triangles[0], [0, 2, 1]);
  assert.throws(
    () => packedMesh({ ...mesh, triangles: mesh.triangles.slice(1) }, 1e-7),
    /collapsed/,
  );
});

test("duplicate packed vertices are joined before a neighboring collinear facet is re-triangulated", () => {
  const mesh: ExportMesh = {
    vertices: [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
      [1, 0, 0],
      [2, 0, 0],
    ],
    triangles: [
      [0, 2, 5],
      [0, 5, 1],
      [0, 4, 3],
      [4, 1, 3],
      [5, 2, 3],
      [5, 3, 1],
      [2, 0, 3],
      [0, 1, 4],
    ],
  };
  const result = packedMesh(mesh, 1e-7);
  validateMesh(result);
  assert.deepEqual(result.vertices, mesh.vertices);
  assert.equal(result.triangles.length, 6);
});
