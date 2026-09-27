import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { validateMesh } from "../src/model/export-mesh.js";
import { roundBody, threadedExport } from "./decorator-domain-fixtures.js";

for (const cut of ["rod", "hole"] as const)
  test(`internal ${cut} threads preserve a blind-hole floor`, async () => {
    const owner = new DocumentOwner();
    try {
      const tube = await roundBody(owner, [8, 5]);
      const floor = await roundBody(owner, [8], 2);
      assert.equal(
        (
          await owner.call({
            kind: "boolean-bodies",
            operation: {
              ids: [tube.id, floor.id],
              mode: "union",
              keepOriginals: false,
            },
          })
        ).error,
        undefined,
      );
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const body = owner.view.data.bodies?.[0];
      assert.ok(body);
      const mesh = await threadedExport(owner, body, 5, cut);
      validateMesh(mesh);
      const interior = mesh.vertices.filter((p) => Math.hypot(p[0], p[1]) < 7.9 && p[2] > 0.001);
      assert.ok(interior.length > 100, "The internal thread must be generated");
      assert.ok(
        interior.every((p) => p[2] >= 1.99999),
        "Threads must not cut below the floor",
      );
      assert.ok(mesh.vertices.every((p) => p[2] >= -1e-5 && p[2] <= 10.00001));
      const floorTriangles = mesh.triangles.filter((t) =>
        t.every((i) => Math.abs(mesh.vertices[i][2] - 2) < 1e-5),
      );
      const area = floorTriangles.reduce((sum, [a, b, c]) => {
        const [p, q, r] = [a, b, c].map((i) => mesh.vertices[i]);
        return sum + Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
      }, 0);
      assert.ok(area > Math.PI * 4 ** 2, "The blind floor remains a closed disk");
    } finally {
      owner.close();
    }
  });
