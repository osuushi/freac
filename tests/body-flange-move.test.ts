import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, FaceMovement } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/threaded-flange-move.json", "utf8")) as {
  document: SketchDocument;
  operation: FaceMovement;
};
const neck = "20fedd74-e4c2-4019-b4ac-0074e4d22572";
function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
function check(before: Body, after: Body, distance: number) {
  assert.deepEqual(after.faces.map((f) => f.id).sort(), before.faces.map((f) => f.id).sort());
  assert.deepEqual(after.edges.map((e) => e.id).sort(), before.edges.map((e) => e.id).sort());
  const selected = new Set(fixture.operation.faces.map((f) => f.face));
  for (const face of before.faces) {
    const moved = after.faces.find((f) => f.id === face.id);
    assert.ok(moved);
    if (face.id === neck) {
      assert.ok(moved.cylinder);
      near(moved.cylinder.radius, 3.5);
      continue;
    }
    for (let i = 0; i < face.signature.length; i++)
      near(
        moved.signature[i],
        face.signature[i] + (selected.has(face.id) && i === 5 ? distance : 0),
      );
  }
  near(after.volume - before.volume, Math.PI * 3.5 ** 2 * distance, 1e-4);
  near(after.bounds[5] - before.bounds[5], distance);
  near(after.bounds[2], before.bounds[2]);
}
test("captured flange lengthens its cylindrical neck while preserving threads and lifecycle", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    for (const distance of [1, 2, -0.1]) {
      const reply = await owner.call({
        kind: "move-faces",
        operation: { ...fixture.operation, translation: [0, 0, distance] },
      });
      assert.equal(reply.error, undefined);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      check(body, moved, distance);
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "cancel-preview" });
      assert.equal(owner.view.data, original);
    }
    assert.equal(
      (await owner.call({ kind: "move-faces", operation: fixture.operation })).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const reopened = owner.view.data;
    const reverse = await owner.call({
      kind: "move-faces",
      operation: { ...fixture.operation, translation: [0, 0, -2] },
    });
    assert.equal(reverse.error, undefined);
    const returned = reverse.view.candidate?.bodies?.[0];
    assert.ok(returned);
    check(body, returned, 0);
    await owner.call({ kind: "cancel-preview" });
    const rejected = await owner.call({
      kind: "move-faces",
      operation: { ...fixture.operation, translation: [0, 0, -6] },
    });
    assert.ok(rejected.error);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, reopened);
  } finally {
    owner.close();
  }
});

test("captured cylindrical reconnection follows a rotated and translated body", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const id = fixture.operation.faces[0].body;
    const transform = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [id],
        pivot: [0, 0, 0],
        axis: [0, 1, 0],
        angle: 90,
        translation: [20, -30, 40],
        duplicate: false,
      },
    });
    assert.equal(transform.error, undefined);
    const before = owner.view.data.bodies?.[0];
    assert.ok(before);
    const reply = await owner.call({
      kind: "move-faces",
      operation: { ...fixture.operation, translation: [2, 0, 0] },
    });
    assert.equal(reply.error, undefined);
    const moved = reply.view.candidate?.bodies?.[0];
    assert.ok(moved);
    near(moved.volume - before.volume, Math.PI * 3.5 ** 2 * 2, 1e-4);
    near(moved.bounds[3] - before.bounds[3], 2);
    near(moved.faces.find((f) => f.id === neck)?.cylinder?.radius ?? 0, 3.5);
  } finally {
    owner.close();
  }
});
