import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism } from "./body-edge-fixtures.js";

const step = [
  [0, 0],
  [20, 0],
  [20, 10],
  [10, 10],
  [10, 20],
  [0, 20],
];
for (const outward of [false, true])
  test(`planar contact merges and continues ${outward ? "outward" : "inward"}`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = await prism(owner, step),
        original = owner.view.data;
      const x = outward ? 10 : 20;
      const face = body.faces.find(
        (f) =>
          f.plane &&
          Math.abs(f.plane.origin[0] - x) < 1e-6 &&
          Math.abs(f.plane.u[0]) + Math.abs(f.plane.v[0]) < 1e-6,
      );
      assert.ok(face);
      for (const travel of [5, 10, 15, 5, 15]) {
        const distance = outward ? travel : -travel;
        const reply = await owner.call({
          kind: "offset-faces",
          operation: { faces: [{ body: body.id, face: face.id }], distance },
        });
        assert.equal(reply.error, undefined);
        assert.equal(reply.view.offsetDistance, distance);
        assert.equal(reply.view.data, original);
        const next = reply.view.candidate?.bodies?.[0];
        assert.ok(next);
        const expected =
          travel < 10 ? 3000 + (outward ? 1 : -1) * travel * 100 : (x + distance) * 200;
        assert.ok(Math.abs(next.volume - expected) < 1e-6);
        assert.equal(next.faces.length, travel < 10 ? 8 : 6);
        assert.equal(next.edges.length, travel < 10 ? 18 : 12);
        const highlighted = reply.view.offsetSelection ?? [];
        assert.equal(highlighted.length, 1);
        const moved = next.faces.find((f) => f.id === highlighted[0].face);
        assert.ok(moved?.plane);
        assert.ok(Math.abs(moved.plane.origin[0] - (x + distance)) < 1e-6);
        if (travel >= 10)
          assert.notEqual(moved.id, face.id, "Merged face receives a fresh identity");
      }
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.equal(owner.view.data.bodies?.[0].faces.length, 6);
    } finally {
      owner.close();
    }
  });
test("offset stops at verified geometry and reverses without a sticky limit", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, step);
    const face = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[0] - 20) < 1e-6);
    assert.ok(face);
    const operation = { faces: [{ body: body.id, face: face.id }], distance: -15 };
    await owner.call({ kind: "offset-faces", operation });
    const limited = await owner.call({
      kind: "offset-faces",
      operation: { ...operation, distance: -30 },
    });
    assert.equal(limited.error, undefined);
    assert.ok((limited.view.offsetDistance ?? 0) > -20);
    assert.ok((limited.view.offsetDistance ?? 0) <= -15);
    assert.ok((limited.view.candidate?.bodies?.[0].volume ?? 0) > 0);
    const reverse = await owner.call({
      kind: "offset-faces",
      operation: { ...operation, distance: -5 },
    });
    assert.equal(reverse.error, undefined);
    assert.equal(reverse.view.offsetDistance, -5);
    assert.equal(reverse.view.candidate?.bodies?.[0].faces.length, 8);
  } finally {
    owner.close();
  }
});

test("contact follows rotated geometry through successive steps", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 30],
      [0, 30],
    ]);
    const face = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[0] - 30) < 1e-6);
    assert.ok(face);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [1, 2, 3],
            angle: 37,
            pivot: [0, 0, 0],
            translation: [12, -8, 3],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const reply = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: face.id }], distance: -25 },
    });
    assert.equal(reply.error, undefined);
    const next = reply.view.candidate?.bodies?.[0];
    assert.ok(next);
    assert.ok(Math.abs(next.volume - 1500) < 1e-6);
    assert.equal(next.faces.length, 6);
    assert.equal(next.edges.length, 12);
  } finally {
    owner.close();
  }
});

test("crossing a parallel support plane without finite-face contact does not pull its face", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [20, 0],
      [20, 5],
      [5, 5],
      [5, 15],
      [10, 15],
      [10, 20],
      [0, 20],
    ]);
    const face = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[0] - 20) < 1e-6);
    const remote = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[0] - 10) < 1e-6);
    assert.ok(face && remote);
    const reply = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: face.id }], distance: -12 },
    });
    assert.equal(reply.error, undefined);
    const next = reply.view.candidate?.bodies?.[0];
    assert.ok(next);
    assert.ok(Math.abs(next.volume - 1400) < 1e-6);
    assert.deepEqual(next.faces.find((f) => f.id === remote.id)?.plane, remote.plane);
  } finally {
    owner.close();
  }
});
