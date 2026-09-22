import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";
import { atHeight, shoulder } from "./edge-movement-fixtures.js";
import { cap, shell } from "./shell-fixtures.js";

test("shell rejects collapse and invalid inputs without accepting last good preview", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const source = owner.view.data;
    await shell(owner, body, -1, [cap(body, 10)]);
    for (const thickness of [-10, -30, 0, NaN, Infinity]) {
      const reply = await owner.call({
        kind: "shell",
        operation: { thickness, selection: [{ body: body.id, faces: [cap(body, 10)] }] },
      });
      assert.ok(reply.error, `should reject ${thickness}`);
      assert.equal(reply.view.candidate, null);
      assert.equal(reply.view.data, source);
      assert.ok((await owner.call({ kind: "accept" })).error);
    }
  } finally {
    owner.close();
  }
});

test("shell preserves retained topology, single Undo, reopen and ordinary subsequent edits", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    const top = cap(body, 10);
    const bottom = cap(body, 0);
    const candidate = await shell(owner, body, -1, [top]);
    for (const face of body.faces.filter((f) => f.id !== top))
      assert.ok(candidate.faces.some((f) => f.id === face.id));
    assert.ok(!candidate.faces.some((f) => f.id === top));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      candidate.faces.map((f) => f.id),
    );
    const edit = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: bottom }], distance: 0.2 },
    });
    assert.equal(edit.error, undefined);
    assert.equal(edit.view.offsetDistance, 0.2);
    assert.ok((edit.view.candidate?.bodies?.[0].volume ?? 0) > candidate.volume);
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data.bodies?.[0].brep, after.bodies?.[0].brep);
  } finally {
    owner.close();
  }
});

test("shell is atomic across bodies and retains rejected intent in history", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const thin = await prism(owner, [
      [30, 0],
      [32, 0],
      [32, 20],
      [30, 20],
    ]);
    const before = owner.view.data;
    const selection = [box, thin].map((b) => ({ body: b.id, faces: [cap(b, 10)] }));
    const good = await owner.call({ kind: "shell", operation: { selection, thickness: -0.4 } });
    assert.equal(good.error, undefined);
    assert.equal(good.view.candidate?.bodies?.length, 2);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    const bad = await owner.call({ kind: "shell", operation: { selection, thickness: -1.5 } });
    assert.ok(bad.error);
    assert.equal(bad.view.candidate, null);
    assert.equal(bad.view.canRedo, true);
    assert.equal(bad.view.data, before);
    const history = (await owner.call({ kind: "read-history" })).history;
    assert.equal(history?.at(-1)?.outcome, "failed");
    assert.deepEqual(history?.at(-1)?.operation.parameters, {
      operation: { selection, thickness: -1.5 },
    });
    for (const faces of [["missing"], [cap(box, 10), cap(box, 10)], box.faces.map((f) => f.id)]) {
      assert.ok(
        (
          await owner.call({
            kind: "shell",
            operation: {
              selection: [{ body: box.id, faces }],
              thickness: -0.5,
            },
          })
        ).error,
      );
      assert.equal(owner.view.data, before);
    }
    await shell(owner, box, -0.5, [cap(box, 10)]);
    await owner.call({ kind: "cancel-preview" });
    assert.equal(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("shell rejects invalid boundaries on materialized warped geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const { body } = await shoulder(owner, false);
    const edge = atHeight(body, 8)[0];
    assert.equal(
      (
        await owner.call({
          kind: "move-edges",
          operation: {
            edges: [{ body: body.id, edge: edge.id }],
            translation: [0, 0, 1],
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const before = owner.view.data;
    const result = await owner.call({
      kind: "shell",
      operation: {
        selection: [{ body: body.id, faces: [] }],
        thickness: -0.5,
      },
    });
    assert.match(result.error ?? "", /invalid boundaries or surface geometry/);
    assert.equal(result.view.candidate, null);
    assert.equal(result.view.data, before);
  } finally {
    owner.close();
  }
});

test("shell rejects self-interference on the genuine cubic extrusion", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "arch",
          kind: "bezier",
          a: { x: 0, y: 0 },
          c1: { x: 0, y: 10 },
          c2: { x: 10, y: 10 },
          b: { x: 10, y: 0 },
          construction: false,
        },
        { id: "base", kind: "segment", a: { x: 10, y: 0 }, b: { x: 0, y: 0 }, construction: false },
      ],
    });
    const original = owner.view.data;
    const reply = await owner.call({
      kind: "shell",
      operation: {
        thickness: -0.5,
        selection: [{ body: body.id, faces: [cap(body, 10)] }],
      },
    });
    assert.match(reply.error ?? "", /self-intersections/);
    assert.equal(reply.view.candidate, null);
    assert.equal(reply.view.data, original);
  } finally {
    owner.close();
  }
});
