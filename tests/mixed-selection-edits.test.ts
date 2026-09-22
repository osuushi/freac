import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism, square } from "./body-edge-fixtures.js";

async function pair(owner: DocumentOwner) {
  const a = await prism(owner, square);
  const b = await prism(
    owner,
    square.map(([x, y]) => [x + 40, y]),
  );
  const top = b.faces.find(
    (f) =>
      f.plane &&
      Math.abs(f.plane.origin[2] - 10) < 1e-6 &&
      Math.abs(f.plane.u[2]) < 1e-6 &&
      Math.abs(f.plane.v[2]) < 1e-6,
  );
  assert.ok(top);
  return { a, b, top };
}

test("mixed body and face movement keeps both changes temporary and accepts one Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const { a, b, top } = await pair(owner);
    const before = owner.view.data;
    const result = await owner.call({
      kind: "move-faces",
      operation: {
        bodyIds: [a.id],
        faces: [{ body: b.id, face: top.id }],
        translation: [0, 0, 2],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
      },
    });
    assert.equal(result.error, undefined);
    assert.deepEqual(owner.view.data, before);
    const candidate = result.view.candidate;
    assert.ok(candidate);
    const moved = candidate.bodies?.find((body) => body.id === a.id);
    const stretched = candidate.bodies?.find((body) => body.id === b.id);
    assert.ok(moved && stretched);
    assert.ok(Math.abs(moved.center[2] - a.center[2] - 2) < 1e-7);
    assert.ok(Math.abs(moved.volume - a.volume) < 1e-6);
    assert.ok(Math.abs(stretched.volume - b.volume * 1.2) < 1e-5);
    assert.deepEqual(
      moved.faces.map((f) => f.id),
      a.faces.map((f) => f.id),
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});

test("failed component movement or healing cannot partially move or delete a whole body", async () => {
  const owner = new DocumentOwner();
  try {
    const { a, b, top } = await pair(owner);
    const before = owner.view.data;
    const failed = await owner.call({
      kind: "move-faces",
      operation: {
        bodyIds: [a.id],
        faces: [{ body: b.id, face: "missing" }],
        translation: [0, 0, 2],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
      },
    });
    assert.ok(failed.error);
    assert.deepEqual(owner.view.data, before);
    const deleted = await owner.call({
      kind: "delete-entities",
      bodyIds: [a.id],
      sketchIds: [],
      topology: [{ body: b.id, whole: false, faces: [top.id], edges: [] }],
    });
    assert.ok(deleted.error, "Removing a plain box cap cannot heal a closed solid");
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("mixed whole-body removal and face healing succeed as one immediate Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const { a, b } = await pair(owner);
    const { finish, vertical } = await import("./body-edge-fixtures.js");
    const rounded = await finish(owner, b, [vertical(b, 40, 0)], 2);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const blends = rounded.faces.filter((f) => !b.faces.some((before) => before.id === f.id));
    assert.equal(blends.length, 1);
    const before = owner.view.data;
    const result = await owner.call({
      kind: "delete-entities",
      bodyIds: [a.id],
      sketchIds: [],
      topology: [{ body: b.id, whole: false, faces: blends.map((f) => f.id), edges: [] }],
    });
    assert.equal(result.error, undefined);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.data.bodies?.length, 1);
    const healed = owner.view.data.bodies?.[0];
    assert.ok(healed);
    assert.equal(healed.id, b.id);
    assert.equal(healed.faces.length, b.faces.length);
    assert.ok(Math.abs(healed.volume - b.volume) < 1e-6);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});

test("mixed whole-body and edge translation preserves rigid geometry and cancels atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const { a, b } = await pair(owner);
    const edge = b.edges.find((e) =>
      e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    assert.ok(edge);
    const before = owner.view.data;
    const result = await owner.call({
      kind: "move-edges",
      operation: {
        bodyIds: [a.id],
        edges: [{ body: b.id, edge: edge.id }],
        translation: [0, 0, 2],
      },
    });
    assert.equal(result.error, undefined);
    const next = result.view.candidate?.bodies;
    assert.ok(next);
    assert.ok(Math.abs(next[0].center[2] - a.center[2] - 2) < 1e-7);
    assert.ok(Math.abs(next[0].volume - a.volume) < 1e-6);
    assert.notEqual(next[1].brep, b.brep);
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "cancel-preview" })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});
