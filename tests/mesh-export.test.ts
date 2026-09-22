import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import { exportBodies } from "../src/model/mesh-export.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { shell } from "./shell-fixtures.js";

function meshVolume(vertices: number[][], triangles: number[][]): number {
  return triangles.reduce((sum, triangle) => {
    const [a, b, c] = triangle.map((index) => vertices[index]);
    return (
      sum +
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6
    );
  }, 0);
}

test("STL/3MF preserve multiple exact boxes, world placement and accepted history", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    await prism(
      owner,
      square.map(([x, y]) => [x + 30, y - 10]),
    );
    const before = structuredClone(owner.view);
    const bodies = owner.view.data.bodies ?? [];
    const stl = exportBodies(bodies, "stl");
    const geometry = new STLLoader().parse(stl.buffer);
    geometry.computeBoundingBox();
    assert.deepEqual(geometry.boundingBox?.min.toArray(), [0, -10, 0]);
    assert.deepEqual(geometry.boundingBox?.max.toArray(), [50, 20, 10]);
    const coordinates = Array.from(geometry.attributes.position.array);
    const points = Array.from({ length: coordinates.length / 3 }, (_, i) =>
      coordinates.slice(i * 3, i * 3 + 3),
    );
    const triangles = Array.from({ length: points.length / 3 }, (_, i) => [
      3 * i,
      3 * i + 1,
      3 * i + 2,
    ]);
    assert.ok(Math.abs(meshVolume(points, triangles) - 8000) < 1e-8);
    const files = unzipSync(exportBodies(bodies, "3mf"));
    assert.deepEqual(
      Object.keys(files).sort(),
      ["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"].sort(),
    );
    assert.match(strFromU8(files["_rels/.rels"]), /Target="\/3D\/3dmodel.model"/);
    const model = strFromU8(files["3D/3dmodel.model"]);
    assert.match(model, /unit="millimeter"/);
    assert.equal((model.match(/<object /g) ?? []).length, 2);
    assert.equal((model.match(/<item /g) ?? []).length, 2);
    for (const object of model.matchAll(/<object .*?<\/object>/g)) {
      const vertices = [...object[0].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(
        (m) => m.slice(1).map(Number),
      );
      const facets = [...object[0].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(
        (m) => m.slice(1).map(Number),
      );
      assert.equal(vertices.length, 8);
      assert.ok(Math.abs(meshVolume(vertices, facets) - 4000) < 1e-8);
    }
    assert.deepEqual(owner.view, before);
    geometry.dispose();
  } finally {
    owner.close();
  }
});

test("curved through-hole and sealed hollow export closed oriented meshes with correct volume", async () => {
  const owner = new DocumentOwner();
  try {
    const ring = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [10, 3].map((radius, i) => ({
        id: `circle${i}`,
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    });
    const mesh = exportMesh(ring);
    assert.ok(Math.abs(meshVolume(mesh.vertices, mesh.triangles) / ring.volume - 1) < 0.002);
    assert.ok(exportBodies([ring], "3mf").length > 0);
    const box = await prism(
      owner,
      square.map(([x, y]) => [x + 40, y]),
    );
    const hollow = await shell(owner, box, -1);
    const hollowMesh = exportMesh(hollow);
    assert.ok(
      Math.abs(meshVolume(hollowMesh.vertices, hollowMesh.triangles) - hollow.volume) < 1e-6,
    );
    assert.ok(exportBodies([hollow], "stl").length > 0);
  } finally {
    owner.close();
  }
});

test("empty, missing faces and corrupt meshes fail rather than emit printable-looking files", async () => {
  assert.throws(() => exportBodies([], "3mf"), /Create a solid/);
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    assert.throws(
      () => exportBodies([{ ...body, faces: body.faces.slice(1) }], "3mf"),
      /not closed/,
    );
    const faces = structuredClone(body.faces);
    faces[0].vertices[0] = NaN;
    assert.throws(() => exportBodies([{ ...body, faces }], "stl"), /invalid coordinates/);
    assert.throws(() => exportBodies([{ ...body, faces: [] }], "stl"), /no solid mesh/);
  } finally {
    owner.close();
  }
});

test("collapsed tessellation facets can be omitted only when the remaining mesh stays closed", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const faces = structuredClone(body.faces);
    const point = faces[0].vertices.slice(0, 3);
    faces[0].vertices.push(...point, ...point, ...point);
    assert.deepEqual(exportMesh({ ...body, faces }), exportMesh(body));
    // A collapsed facet cannot substitute for a real piece of the boundary.
    faces[0].vertices.splice(0, 9, ...point, ...point, ...point);
    assert.throws(() => exportMesh({ ...body, faces }), /not closed/);
    faces[0].vertices.splice(0, 9, 0, 0, 0, 1, 0, 0, 2, 0, 0);
    assert.throws(() => exportMesh({ ...body, faces }), /degenerate triangle/);
  } finally {
    owner.close();
  }
});

test("captured filleted solid exports after native remeshing without modifying accepted geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const body = JSON.parse(readFileSync("tests/fixtures/filleted-export.json", "utf8"));
    const document = { units: "mm" as const, sketches: [], bodies: [body] };
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const before = structuredClone(owner.view);
    const bodies = owner.view.data.bodies ?? [];
    const mesh = exportMesh(bodies[0]);
    const inputCount = bodies[0].faces.reduce((sum, face) => sum + face.vertices.length / 9, 0);
    assert.equal(inputCount - mesh.triangles.length, 6);
    // Remeshing can change facet counts. Compare against this input mesh, including
    // its zero-area facets, to prove export preparation preserves signed volume.
    const coordinates = bodies[0].faces.flatMap((face) => face.vertices);
    const points = Array.from({ length: coordinates.length / 3 }, (_, i) =>
      coordinates.slice(i * 3, i * 3 + 3),
    );
    const facets = Array.from({ length: inputCount }, (_, i) => [3 * i, 3 * i + 1, 3 * i + 2]);
    const inputVolume = meshVolume(points, facets);
    assert.ok(inputVolume > 0);
    assert.ok(Math.abs(meshVolume(mesh.vertices, mesh.triangles) - inputVolume) < 1e-8);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies(bodies, format).length > 0);
    assert.deepEqual(owner.view, before);
    const faces = bodies[0].faces.slice(1);
    assert.throws(() => exportMesh({ ...bodies[0], faces }), /not closed/);
  } finally {
    owner.close();
  }
});
