import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Face } from "../src/model/body.js";
import { prism, square } from "./body-edge-fixtures.js";

import { feature, operation } from "./face-movement-fixtures.js";

for (const kind of ["hole", "pocket", "boss"] as const)
  test(`face movement ${kind}: exact preview, rejection, continuing faces, history and reopen`, async () => {
    const owner = new DocumentOwner();
    try {
      await prism(owner, square);
      const body = await feature(owner, kind),
        before = owner.view.data;
      const edit = operation(body, kind, 3);
      assert.equal(edit.faces.length, kind === "hole" ? 1 : 5);
      const reply = await owner.call({ kind: "move-faces", operation: edit });
      assert.equal(reply.error, undefined);
      assert.deepEqual(owner.view.data, before);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
      assert.equal(moved.id, body.id);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
      for (const target of edit.faces) {
        const old = body.faces.find((f) => f.id === target.face);
        const next: Face | undefined = moved.faces.find((f) => f.id === target.face);
        assert.ok(old && next);
        if (old.cylinder && next.cylinder) {
          assert.ok(Math.abs(next.cylinder.origin[0] - old.cylinder.origin[0] - 3) < 1e-7);
          assert.equal(next.cylinder.radius, old.cylinder.radius);
          continue;
        }
        assert.ok(
          Math.abs(
            Math.min(...next.vertices.filter((_, i) => i % 3 === 0)) -
              Math.min(...old.vertices.filter((_, i) => i % 3 === 0)) -
              3,
          ) < 1e-6,
        );
      }
      const bad = await owner.call({
        kind: "move-faces",
        operation: { ...edit, translation: [8, 0, 0] },
      });
      assert.ok(bad.error);
      assert.equal(bad.view.candidate, null);
      assert.deepEqual(bad.view.data, before);
      assert.ok((await owner.call({ kind: "accept" })).error);
      assert.equal((await owner.call({ kind: "move-faces", operation: edit })).error, undefined);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.equal(
        (await owner.call({ kind: "move-faces", operation: { ...edit, translation: [-3, 0, 0] } }))
          .error,
        undefined,
      );
      assert.equal((await owner.call({ kind: "discard" })).error, undefined);
      assert.equal(owner.view.candidate, null);
    } finally {
      owner.close();
    }
  });

test("face movement accepts partial features but rejects mixed-body selections", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    const body = await feature(owner, "pocket"),
      before = owner.view.data;
    const edit = operation(body, "pocket", 1);
    const partial = await owner.call({
      kind: "move-faces",
      operation: { ...edit, faces: edit.faces.slice(0, 4) },
    });
    assert.equal(partial.error, undefined);
    assert.ok(partial.view.candidate);
    assert.deepEqual(owner.view.data, before);
    const faces = [edit.faces[0], { ...edit.faces[1], body: "absent" }];
    assert.ok((await owner.call({ kind: "move-faces", operation: { ...edit, faces } })).error);
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("face movement protects planar neighbors, rotates, and cancels in-flight geometry", async () => {
  for (const kind of ["boss", "pocket"] as const) {
    const owner = new DocumentOwner();
    try {
      await prism(owner, square);
      const first = await feature(owner, kind);
      const edit = operation(first, kind, 1);
      const body = await feature(owner, kind === "boss" ? "pocket" : "boss", 14);
      assert.ok(edit.faces.every((t) => body.faces.some((f) => f.id === t.face)));
      const before = owner.view.data;
      assert.equal((await owner.call({ kind: "move-faces", operation: edit })).error, undefined);
      const contact = await owner.call({
        kind: "move-faces",
        operation: { ...edit, translation: [2, 0, 0] },
      });
      assert.ok(contact.error);
      assert.equal(contact.view.candidate, null);
      assert.deepEqual(owner.view.data, before);
      assert.equal(
        (
          await owner.call({
            kind: "move-faces",
            operation: { ...edit, translation: [0, 0, 0], angle: 10 },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "discard" });
      const pending = owner.call({ kind: "move-faces", operation: edit });
      await owner.call({ kind: "cancel-preview" });
      await pending;
      assert.equal(owner.view.candidate, null);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "move-faces", operation: edit })).error, undefined);
    } finally {
      owner.close();
    }
  }
});
