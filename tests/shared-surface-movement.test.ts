import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { FaceMovement } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

for (const angle of [0, 20])
  test(`shared-cylinder patches retain their own IDs through ${angle} degree move and reopen`, async () => {
    const fixture: { document: SketchDocument; operation: FaceMovement } = JSON.parse(
      readFileSync("tests/fixtures/shared-cylinder-move.json", "utf8"),
    );
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const original = owner.view.data,
        body = original.bodies?.[0];
      assert.ok(body);
      const operation: FaceMovement = { ...fixture.operation, axis: [0, 0, 1], angle };
      const reply = await owner.call({ kind: "move-faces", operation });
      assert.equal(reply.error, undefined);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.deepEqual(owner.view.data, original);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
      assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
      for (const target of operation.faces) {
        const before = body.faces.find((f) => f.id === target.face);
        const after = moved.faces.find((f) => f.id === target.face);
        assert.ok(before && after);
        assert.ok(Math.abs(after.signature[2] - before.signature[2]) < 1e-6);
        const x = before.signature[3] - operation.pivot[0],
          y = before.signature[4] - operation.pivot[1];
        const a = (angle * Math.PI) / 180;
        assert.ok(
          Math.abs(
            after.signature[3] - (operation.pivot[0] + x * Math.cos(a) - y * Math.sin(a) + 6),
          ) < 1e-6,
        );
        assert.ok(
          Math.abs(after.signature[4] - (operation.pivot[1] + x * Math.sin(a) + y * Math.cos(a))) <
            1e-6,
        );
      }
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const reverse = await owner.call({
        kind: "move-faces",
        operation: {
          ...operation,
          pivot: [operation.pivot[0] + 6, operation.pivot[1], operation.pivot[2]],
          angle: -angle,
          translation: [-6, 0, 0],
        },
      });
      assert.equal(reverse.error, undefined);
      const restored = reverse.view.candidate?.bodies?.[0];
      assert.ok(restored);
      for (const face of body.faces) {
        const returned = restored.faces.find((f) => f.id === face.id);
        assert.ok(returned);
        for (let i = 2; i < 6; i++)
          assert.ok(Math.abs(face.signature[i] - returned.signature[i]) < 1e-6);
      }
    } finally {
      owner.close();
    }
  });

test("through-hole tilt reconnects perforated faces and rejects disconnection atomically", async () => {
  const fixture: { document: SketchDocument; operation: FaceMovement } = JSON.parse(
    readFileSync("tests/fixtures/hole-in-cylinder.json", "utf8"),
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const operation: FaceMovement = {
      ...fixture.operation,
      angle: 5,
      axis: [1, 0, 0],
      translation: [0, 0, 0],
    };
    const reply = await owner.call({ kind: "move-faces", operation });
    assert.equal(reply.error, undefined);
    const source = original.bodies?.[0],
      moved = reply.view.candidate?.bodies?.[0];
    assert.ok(source && moved);
    assert.deepEqual(
      moved.faces.map((face) => face.id).sort(),
      source.faces.map((face) => face.id).sort(),
    );
    for (const target of operation.faces) {
      const before = source.faces.find((face) => face.id === target.face);
      const after = moved.faces.find((face) => face.id === target.face);
      assert.ok(before && after);
      const angle = (5 * Math.PI) / 180;
      const y = before.signature[4] - operation.pivot[1];
      const z = before.signature[5] - operation.pivot[2];
      assert.ok(Math.abs(after.signature[2] - before.signature[2]) < 1e-6);
      assert.ok(Math.abs(after.signature[3] - before.signature[3]) < 1e-6);
      assert.ok(
        Math.abs(
          after.signature[4] - operation.pivot[1] - y * Math.cos(angle) + z * Math.sin(angle),
        ) < 1e-6,
      );
      assert.ok(
        Math.abs(
          after.signature[5] - operation.pivot[2] - y * Math.sin(angle) - z * Math.cos(angle),
        ) < 1e-6,
      );
    }
    assert.deepEqual(owner.view.data, original);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.deepEqual(owner.view.data, original);
    const rejected = await owner.call({
      kind: "move-faces",
      operation: { ...operation, translation: [100, 0, 0] },
    });
    assert.ok(rejected.error);
    assert.equal(rejected.view.candidate, null);
    assert.deepEqual(owner.view.data, original);
    assert.ok((await owner.call({ kind: "accept" })).error);
    assert.equal(
      (await owner.call({ kind: "move-faces", operation: fixture.operation })).error,
      undefined,
    );
    assert.ok(owner.view.candidate);
  } finally {
    owner.close();
  }
});
