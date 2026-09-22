import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

test("symmetric chamfers use equal setbacks on convex and concave edges with atomic history", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const concave = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [10, 20],
      [0, 20],
    ]);
    const original = owner.view.data;
    const edges = [
      { body: box.id, edge: vertical(box, 0, 0).id },
      { body: concave.id, edge: vertical(concave, 10, 10).id },
    ];
    const preview = await owner.call({
      kind: "finish-edges",
      operation: { edges, mode: "chamfer", size: 2 },
    });
    assert.equal(preview.error, undefined);
    assert.equal(preview.view.edgeSize, 2);
    const bodies = preview.view.candidate?.bodies;
    assert.ok(bodies);
    assert.deepEqual(
      bodies.map((b) => b.id),
      [box.id, concave.id],
    );
    assert.ok(Math.abs(bodies[0].volume - 3980) < 1e-6);
    assert.ok(Math.abs(bodies[1].volume - 3020) < 1e-6);
    assert.equal(bodies[0].faces.length, 7);
    assert.ok(
      bodies[0].faces.every((f) => f.plane),
      "Straight box chamfer adds a planar face",
    );
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.map((b) => b.id),
      [box.id, concave.id],
    );
  } finally {
    owner.close();
  }
});

test("chamfer supports circular rims, constrains huge requests, recovers smaller sizes and treats zero as no-op", async () => {
  const owner = new DocumentOwner();
  try {
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 8, construction: false },
      ],
    });
    const rim = cylinder.edges.find((e) => e.curve?.kind === "circle");
    assert.ok(rim);
    const result = await finish(owner, cylinder, [rim], 2, "chamfer");
    // Revolved triangular removal: integral pi*(R^2 - (R - t)^2) dt, t in [0,d].
    assert.ok(Math.abs(result.volume - (640 * Math.PI - Math.PI * (8 * 4 - 8 / 3))) < 1e-6);
    assert.equal(result.faces.length, 4);
    const edges = [{ body: cylinder.id, edge: rim.id }];
    const overshoot = await owner.call({
      kind: "finish-edges",
      operation: { edges, mode: "chamfer", size: 1e6 },
    });
    assert.equal(overshoot.error, undefined);
    const limit = overshoot.view.edgeSize;
    assert.ok(limit && limit > 7.9 && limit <= 8);
    const repeated = await owner.call({
      kind: "finish-edges",
      operation: { edges, mode: "chamfer", size: 2e6 },
    });
    assert.equal(repeated.view.edgeSize, limit);
    assert.equal(
      repeated.view.candidate?.bodies?.[0].brep,
      overshoot.view.candidate?.bodies?.[0].brep,
    );
    await finish(owner, cylinder, [rim], 1, "chamfer");
    assert.equal(owner.view.edgeSize, 1);
    const original = owner.view.data;
    for (const size of [-5, 0]) {
      const zero = await owner.call({
        kind: "finish-edges",
        operation: { edges, mode: "chamfer", size },
      });
      assert.equal(zero.error, undefined);
      assert.equal(zero.view.edgeSize, 0);
      assert.deepEqual(zero.view.candidate, original);
      await owner.call({ kind: "accept" });
      assert.deepEqual(owner.view.data, original);
    }
    // Same selection with another tool must not reuse the chamfer result/bound.
    const rounded = await finish(owner, cylinder, [rim], 2);
    assert.ok(Math.abs(rounded.volume - result.volume) > 1);
  } finally {
    owner.close();
  }
});

test("chamfer drag frames agree with oriented triangle normals and signed offset geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    await finish(owner, box, [vertical(box, 0, 0)], 4, "chamfer");
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const face = body.faces.find(
      (f) =>
        f.plane &&
        Math.abs(f.plane.u[0] * f.plane.v[2] - f.plane.u[2] * f.plane.v[0]) > 0.1 &&
        Math.abs(f.plane.u[1] * f.plane.v[2] - f.plane.u[2] * f.plane.v[1]) > 0.1,
    );
    assert.ok(face?.plane);
    const cross = (a: readonly number[], b: readonly number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const sourcePlane = face.plane;
    const n = cross(sourcePlane.u, sourcePlane.v);
    const a = face.vertices.slice(0, 3),
      b = face.vertices.slice(3, 6),
      c = face.vertices.slice(6, 9);
    const triangle = cross(
      b.map((v, i) => v - a[i]),
      c.map((v, i) => v - a[i]),
    );
    assert.ok(
      n.reduce((s, v, i) => s + v * triangle[i], 0) > 0,
      "Displayed normal must match the outward triangulation",
    );
    for (const distance of [-1, 1]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: face.id }], distance },
      });
      assert.equal(reply.error, undefined);
      const after = reply.view.candidate?.bodies?.[0];
      const moved = after?.faces.find((f) => f.id === face.id);
      assert.ok(after && moved?.plane);
      const targetPlane = moved.plane;
      assert.ok(
        Math.abs(
          n.reduce((s, v, i) => s + v * (targetPlane.origin[i] - sourcePlane.origin[i]), 0) -
            distance,
        ) < 1e-6,
      );
      assert.ok((after.volume - body.volume) * distance > 0);
    }
  } finally {
    owner.close();
  }
});
