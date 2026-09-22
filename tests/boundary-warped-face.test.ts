import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { shoulder } from "./edge-movement-fixtures.js";

test("a reconstructed curved face can itself move rigidly after reopening", async () => {
  const owner = new DocumentOwner();
  try {
    const { body, edit } = await shoulder(owner, false);
    const result = await owner.call({
      kind: "move-edges",
      operation: { ...edit, edges: edit.edges.slice(0, 1) },
    });
    assert.equal(result.error, undefined);
    const curved = result.view.candidate?.bodies?.[0].faces.find((f) => !f.plane);
    assert.ok(curved);
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    const operation = {
      faces: [{ body: body.id, face: curved.id }],
      pivot: [0, 0, 0] as [number, number, number],
      axis: [0, 0, 1] as [number, number, number],
      angle: 0,
      translation: [0.2, 0, 0] as [number, number, number],
    };
    const moved = await owner.call({ kind: "move-faces", operation });
    assert.equal(moved.error, undefined);
    const next = moved.view.candidate?.bodies?.[0].faces.find((f) => f.id === curved.id);
    assert.ok(next);
    assert.equal(next.plane, null);
    assert.ok(
      Math.abs(next.signature[2] - curved.signature[2]) < 1e-6,
      "Rigid face area stays fixed",
    );
    for (let i = 0; i < 3; i++)
      assert.ok(
        Math.abs(next.signature[i + 3] - curved.signature[i + 3] - operation.translation[i]) < 1e-6,
      );
  } finally {
    owner.close();
  }
});
