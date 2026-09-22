import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import {
  finish as fillet,
  lift,
  prism,
  splitCylinder,
  square,
  vertical,
} from "./body-edge-fixtures.js";

test("exact convex fillet previews shared radii, keeps continuing IDs, accepts one Undo and reopens", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const source = owner.view.data;
    const edge = vertical(body, 0, 0);
    const rounded = await fillet(owner, body, [edge], 2);
    assert.equal(owner.view.data, source);
    assert.ok(Math.abs(rounded.volume - (4000 - 10 * (4 - Math.PI))) < 1e-6);
    assert.equal(rounded.faces.length, 7);
    assert.ok(
      !rounded.edges.some((e) => e.id === edge.id),
      "Consumed edge does not become a blend face",
    );
    const untouched = body.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 0 || Math.abs(v - 20) < 1e-7),
    );
    assert.ok(untouched);
    assert.ok(rounded.faces.some((f) => f.id === untouched.id));
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, source);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.equal(owner.view.data.bodies?.[0].id, body.id);
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      rounded.faces.map((f) => f.id),
    );
  } finally {
    owner.close();
  }
});

test("fillet handles concave edges, meeting edges, circular rims, and constrains infeasible sizes atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const concave = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [10, 20],
      [0, 20],
    ]);
    const rounded = await fillet(owner, concave, [vertical(concave, 10, 10)], 2);
    assert.ok(Math.abs(rounded.volume - (3000 + 10 * (4 - Math.PI))) < 1e-6);
    await owner.call({ kind: "discard" });
    const body = await prism(owner, square);
    const meeting = body.edges.filter(
      (e) =>
        e.curve?.kind === "line" &&
        [e.curve.a, e.curve.b].some((p) => p.every((v) => Math.abs(v) < 1e-7)),
    );
    assert.equal(meeting.length, 3);
    assert.ok((await fillet(owner, body, meeting, 2)).volume < body.volume);
    await owner.call({ kind: "discard" });
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "circle",
          kind: "circle",
          center: { x: 40, y: 0 },
          radius: 8,
          construction: false,
        },
      ],
    });
    const rim = cylinder.edges.find((e) => e.curve?.kind === "circle");
    assert.ok(rim);
    assert.equal((await fillet(owner, cylinder, [rim], 2)).faces.length, 4);
    const original = owner.view.data;
    for (const radius of [0, -1, 100]) {
      const reply = await owner.call({
        kind: "finish-edges",
        operation: {
          edges: [
            { body: concave.id, edge: vertical(concave, 10, 10).id },
            { body: cylinder.id, edge: rim.id },
          ],
          size: radius,
          mode: "fillet",
        },
      });
      assert.equal(reply.error, undefined);
      assert.ok(reply.view.candidate);
      assert.ok((reply.view.edgeSize ?? -1) >= 0);
      if (radius > 0) assert.ok((reply.view.edgeSize ?? Infinity) < radius);
      else assert.equal(reply.view.edgeSize, 0);
      assert.deepEqual(reply.view.data, original);
      await owner.call({ kind: "discard" });
    }
    const recovered = await fillet(owner, cylinder, [rim], 1);
    assert.ok(recovered.volume > 0);
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data, original);
    const foreign = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: [{ body: body.id, edge: rim.id }],
        size: 1,
        mode: "fillet",
      },
    });
    assert.match(foreign.error ?? "", /belong/);
  } finally {
    owner.close();
  }
});

test("fillet radius feasibility comes from exact geometry, including consumption boundaries", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      edge = vertical(body, 0, 0);
    const large = await fillet(owner, body, [edge], 15);
    assert.ok(Math.abs(large.volume - (4000 - 2250 * (1 - Math.PI / 4))) < 1e-6);
    const reply = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: [{ body: body.id, edge: edge.id }],
        size: 20,
        mode: "fillet",
      },
    });
    assert.equal(reply.error, undefined);
    assert.ok((reply.view.edgeSize ?? 0) > 19.9 && (reply.view.edgeSize ?? 20) < 20);
    assert.ok(reply.view.candidate, "Use a verified feasible size below full support consumption");
    assert.equal(owner.view.data.bodies?.[0], body);
  } finally {
    owner.close();
  }
});

test("tangent chains expand selection and multi-body fillets share one atomic preview", async () => {
  const owner = new DocumentOwner();
  try {
    const cylinder = await splitCylinder(owner);
    const rim = cylinder.edges.filter(
      (e) =>
        e.curve?.kind === "arc" && e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    assert.equal(rim.length, 2);
    const originalCylinder = owner.view.data;
    for (const mode of ["fillet", "chamfer"] as const) {
      const operation = { edges: [{ body: cylinder.id, edge: rim[0].id }], mode };
      const selection = await owner.call({ kind: "edge-finish-selection", operation });
      assert.equal(selection.error, undefined);
      assert.deepEqual(
        selection.view.edgeSelection,
        rim.map((e) => ({ body: cylinder.id, edge: e.id })),
      );
      assert.equal(selection.view.data, originalCylinder);
      assert.equal(selection.view.candidate, null);
      const single = await owner.call({
        kind: "finish-edges",
        operation: { ...operation, size: 1 },
      });
      assert.equal(single.error, undefined);
      const result = single.view.candidate?.bodies?.[0];
      assert.ok(result);
      const volume = result.volume;
      assert.ok(volume < cylinder.volume);
      await owner.call({ kind: "discard" });
      assert.ok(Math.abs((await fillet(owner, cylinder, rim, 1, mode)).volume - volume) < 1e-7);
      await owner.call({ kind: "discard" });
    }
    const box = await prism(owner, [
      [20, 0],
      [40, 0],
      [40, 20],
      [20, 20],
    ]);
    const original = owner.view.data;
    const seed = [
      { body: box.id, edge: vertical(box, 20, 0).id },
      { body: cylinder.id, edge: rim[1].id },
    ];
    for (const mode of ["fillet", "chamfer"] as const) {
      const reply = await owner.call({
        kind: "edge-finish-selection",
        operation: { edges: seed, mode },
      });
      assert.equal(reply.error, undefined);
      assert.deepEqual(reply.view.edgeSelection, [...seed, { body: cylinder.id, edge: rim[0].id }]);
      assert.equal(reply.view.data, original);
      assert.equal(reply.view.candidate, null);
    }

    await fillet(owner, cylinder, rim, 1);
    assert.deepEqual(
      owner.view.candidate?.bodies?.map((b) => b.id),
      [cylinder.id, box.id],
      "Filleting the first body must not reorder entity labels",
    );
    await owner.call({ kind: "discard" });
    const reply = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: [
          ...rim.map((edge) => ({ body: cylinder.id, edge: edge.id })),
          { body: box.id, edge: vertical(box, 20, 0).id },
        ],
        size: 1,
        mode: "fillet",
      },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.bodies?.length, 2);
    for (const before of [cylinder, box])
      assert.ok(
        (reply.view.candidate?.bodies?.find((b) => b.id === before.id)?.volume ?? Infinity) <
          before.volume,
      );
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});
