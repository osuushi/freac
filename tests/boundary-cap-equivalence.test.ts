import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { atHeight, shoulder } from "./edge-movement-fixtures.js";

for (const round of [true, false])
  test(`moving ${round ? "round" : "rectangular"} upper boundary equals moving its face`, async () => {
    const owner = new DocumentOwner();
    try {
      const { body } = await shoulder(owner, round);
      const top = body.faces.find((f) =>
        f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
      );
      assert.ok(top);
      const translation: [number, number, number] = [1, 0.5, 1];
      const edgeMove = await owner.call({
        kind: "move-edges",
        operation: {
          translation,
          edges: atHeight(body, 10).map((e) => ({ body: body.id, edge: e.id })),
        },
      });
      assert.equal(edgeMove.error, undefined);
      const a = edgeMove.view.candidate?.bodies?.[0];
      assert.ok(a);
      const faceMove = await owner.call({
        kind: "move-faces",
        operation: {
          translation,
          faces: [{ body: body.id, face: top.id }],
          pivot: [0, 0, 10],
          axis: [0, 1, 0],
          angle: 0,
        },
      });
      assert.equal(faceMove.error, undefined);
      const b = faceMove.view.candidate?.bodies?.[0];
      assert.ok(b);
      assert.ok(Math.abs(a.volume - b.volume) < 1e-6);
      for (const face of a.faces) {
        const other = b.faces.find((f) => f.id === face.id);
        assert.ok(other);
        for (let i = 2; i < 6; i++)
          assert.ok(Math.abs(other.signature[i] - face.signature[i]) < 1e-6);
      }
    } finally {
      owner.close();
    }
  });

test("a tilted circular cap remains rigid while its connection reshapes", async () => {
  const owner = new DocumentOwner();
  try {
    const { body } = await shoulder(owner, true);
    const top = body.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
    );
    assert.ok(top);
    const result = await owner.call({
      kind: "move-faces",
      operation: {
        translation: [0, 0, 0],
        faces: [{ body: body.id, face: top.id }],
        pivot: [0, 0, 10],
        axis: [0, 1, 0],
        angle: 15,
      },
    });
    assert.equal(result.error, undefined);
    const next = result.view.candidate?.bodies?.[0].faces.find((f) => f.id === top.id);
    assert.ok(next?.plane);
    assert.ok(Math.abs(next.signature[2] - top.signature[2]) < 1e-6);
    for (let i = 3; i < 6; i++) assert.ok(Math.abs(next.signature[i] - top.signature[i]) < 1e-6);
  } finally {
    owner.close();
  }
});
