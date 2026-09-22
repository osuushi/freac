import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body } from "../src/model/body.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { finish, prism, square, vertical } from "./body-edge-fixtures.js";
import { feature, selected } from "./face-movement-fixtures.js";

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}
const selection = (body: Body, faces: string[] = [], edges: string[] = []) => ({
  body: body.id,
  whole: false,
  faces,
  edges,
});
async function sameSolid(actual: Body, expected: Body) {
  const kernel = new SolidCalculator();
  try {
    const other = {
      ...expected,
      id: "expected",
      faces: expected.faces.map((f) => ({ ...f, id: `expected-${f.id}` })),
      edges: expected.edges.map((e) => ({ ...e, id: `expected-${e.id}` })),
    };
    for (const ids of [
      [actual.id, other.id],
      [other.id, actual.id],
    ]) {
      const result = await kernel.calculate({
        kind: "boolean",
        mode: "subtract",
        keepOriginals: false,
        ids,
        bodies: [actual, other],
      });
      assert.ok(result.results.reduce((sum, b) => sum + b.volume, 0) < 1e-7);
    }
  } finally {
    kernel.close();
  }
}
for (const kind of ["hole", "pocket", "boss"] as const)
  test(`delete ${kind}: exact healed geometry, immediate acceptance, history, reopening and subsequent edit`, async () => {
    const owner = new DocumentOwner();
    try {
      const stock = await prism(owner, square);
      const body = await feature(owner, kind),
        before = owner.view.data;
      const faces = selected(body, kind).map((t) => t.face);
      const request = { kind: "delete-topology" as const, selection: [selection(body, faces)] };
      await call(owner, request);
      assert.equal(owner.view.candidate, null);
      const healed = owner.view.data.bodies?.[0];
      assert.ok(healed);
      assert.equal(healed.id, body.id);
      assert.equal(healed.faces.length, 6);
      assert.ok(faces.every((id) => !healed.faces.some((f) => f.id === id)));
      await sameSolid(healed, stock);
      for (const face of stock.faces.filter((f) =>
        f.vertices.every((v, i) => i % 3 !== 0 || v === 0),
      ))
        assert.ok(
          healed.faces.some((f) => f.id === face.id),
          "Unchanged side keeps its ID",
        );
      const after = owner.view.data;
      await call(owner, { kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await call(owner, { kind: "redo" });
      assert.deepEqual(owner.view.data, after);
      await call(owner, { kind: "open", document: JSON.parse(JSON.stringify(after)) });
      const reopened = owner.view.data.bodies?.[0];
      assert.ok(reopened);
      const top = reopened.faces.find((f) =>
        f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
      );
      assert.ok(top);
      const offset = await call(owner, {
        kind: "offset-faces",
        operation: { faces: [{ body: reopened.id, face: top.id }], distance: 2 },
      });
      assert.ok(Math.abs((offset.candidate?.bodies?.[0].volume ?? 0) - 4800) < 1e-6);
    } finally {
      owner.close();
    }
  });
for (const mode of ["fillet", "chamfer"] as const)
  test(`delete ${mode} face restores sharp supporting edge`, async () => {
    const owner = new DocumentOwner();
    try {
      const stock = await prism(owner, square);
      const body = await finish(owner, stock, [vertical(stock, 0, 0)], 2, mode);
      await call(owner, { kind: "accept" });
      const faces = body.faces
        .filter((f) => !stock.faces.some((s) => s.id === f.id))
        .map((f) => f.id);
      assert.equal(faces.length, 1);
      await call(owner, { kind: "delete-topology", selection: [selection(body, faces)] });
      const healed = owner.view.data.bodies?.[0];
      assert.ok(healed);
      await sameSolid(healed, stock);
    } finally {
      owner.close();
    }
  });

test("delete same-domain edge; reject sharp and partially removable selections atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const stock = await prism(owner, square);
    const top = stock.faces.find((f) => f.vertices.every((v, i) => i % 3 !== 2 || v === 10));
    assert.ok(top);
    await call(owner, {
      kind: "extrude",
      extrusion: { sources: [{ face: top.id }], distance: 10, mode: "union" },
    });
    await call(owner, { kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const seam = body.edges.find((e) => e.points.every((v, i) => i % 3 !== 2 || v === 10));
    const sharp = body.edges.find((e) => e.points.every((v, i) => i % 3 !== 2 || v === 0));
    assert.ok(seam && sharp);
    const before = owner.view.data;
    await call(owner, { kind: "delete-topology", selection: [selection(body, [], [seam.id])] });
    const clean = owner.view.data.bodies?.[0];
    assert.ok(clean);
    assert.equal(clean.faces.length, body.faces.length - 1);
    assert.ok(!clean.edges.some((e) => e.id === seam.id));
    await sameSolid(clean, body);
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    for (const edges of [[sharp.id], [seam.id, sharp.id], ["absent"]]) {
      const reply = await owner.call({
        kind: "delete-topology",
        selection: [selection(body, [], edges)],
      });
      assert.ok(reply.error);
      assert.equal(reply.view.candidate, null);
      assert.deepEqual(reply.view.data, before);
    }
    const cap = body.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-7),
    );
    assert.ok(cap);
    for (const faces of [[cap.id], body.faces.map((f) => f.id)]) {
      assert.ok(
        (await owner.call({ kind: "delete-topology", selection: [selection(body, faces)] })).error,
      );
      assert.deepEqual(owner.view.data, before);
    }
  } finally {
    owner.close();
  }
});

test("mixed face/edge deletion and multi-body rejection do not partially accept", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    const body = await feature(owner, "hole");
    const faces = selected(body, "hole").map((t) => t.face);
    const rim = body.faces.find((f) => f.id === faces[0])?.edges[0];
    assert.ok(rim);
    const request = {
      kind: "delete-topology" as const,
      selection: [selection(body, faces, [rim])],
    };
    await call(owner, request);
    assert.equal(owner.view.data.bodies?.[0].faces.length, 6);
    assert.equal(owner.view.candidate, null);
    await call(owner, { kind: "undo" });
    const second = await prism(
      owner,
      square.map(([x, y]) => [x + 30, y]),
    );
    const before = owner.view.data;
    assert.ok(
      (
        await owner.call({
          ...request,
          selection: [...request.selection, selection(second, [], [second.edges[0].id])],
        })
      ).error,
    );
    assert.deepEqual(owner.view.data, before);
    const pending = owner.call(request);
    const cancelled = await owner.call({ kind: "cancel-preview" });
    assert.equal(cancelled.error, undefined);
    assert.match((await pending).error ?? "", /cancelled/);
    assert.deepEqual(owner.view.data, before);
    await call(owner, request);
    assert.equal(owner.view.candidate, null);
    assert.deepEqual(owner.view.data.bodies?.[1], second);
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
