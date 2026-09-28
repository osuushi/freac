import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/offset-move-tilted-plate.json", "utf8"),
) as { document: SketchDocument };
const cap = "f0bd87fc-be57-46fc-a23a-563623974875";
function near(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

test("captured boss cap offsets independently of untouched spline base boundaries", async () => {
  const owner = new DocumentOwner();
  try {
    const captured = fixture.document.bodies?.[1];
    assert.ok(captured);
    const document = { ...fixture.document, bodies: [captured] };
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    for (const distance of [-8, 1, 22]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: cap }], distance },
      });
      assert.equal(reply.error, undefined);
      const next = reply.view.candidate?.bodies?.[0];
      assert.ok(next);
      near(next.volume - body.volume, Math.PI * 4 ** 2 * distance);
      near(next.faces.find((face) => face.id === cap)?.plane?.origin[1] ?? NaN, 6 - distance);
      assert.deepEqual(
        new Set(next.edges.map((edge) => edge.id)),
        new Set(body.edges.map((edge) => edge.id)),
      );
      assert.deepEqual(
        new Set(next.faces.map((face) => face.id)),
        new Set(body.faces.map((face) => face.id)),
      );
      assert.deepEqual(owner.view.data, original);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, original);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: original })).error, undefined);
    }
  } finally {
    owner.close();
  }
});

const hole = "6516dd0f-680c-4c05-a20a-923abd04f9e0";
const end = [
  "c73d0cec-15e0-467e-a233-e8302b5d2f26",
  "0f33a426-1462-444d-b414-204f17f978e4",
  "e43a9f58-baf3-431c-a532-bfc87532a70d",
];
for (const [name, selection] of [
  ["hole", [hole]],
  ["rounded end", end],
  ["lower rounded face", [end[0]]],
  ["upper rounded face", [end[2]]],
] as const) {
  test(`captured tilted plate moves its ${name} along world X and reverses after reopening`, async () => {
    const owner = new DocumentOwner();
    try {
      const captured = fixture.document.bodies?.[0];
      assert.ok(captured);
      assert.equal(
        (await owner.call({ kind: "open", document: { ...fixture.document, bodies: [captured] } }))
          .error,
        undefined,
      );
      const original = owner.view.data;
      const body = original.bodies?.[0];
      assert.ok(body);
      const move = (distance: number) =>
        owner.call({
          kind: "move-faces",
          operation: {
            faces: selection.map((face) => ({ body: body.id, face })),
            translation: [distance, 0, 0],
            axis: [1, 0, 0],
            pivot: [0, 0, 0],
            angle: 0,
          },
        });
      for (const distance of [-6, 6]) {
        const reply = await move(distance);
        assert.equal(reply.error, undefined);
        const result = reply.view.candidate?.bodies?.[0];
        assert.ok(result);
        for (const id of selection) {
          const from = body.faces.find((face) => face.id === id);
          const to = result.faces.find((face) => face.id === id);
          assert.ok(from && to);
          for (let axis = 0; axis < 3; axis++)
            near(to.signature[axis + 3], from.signature[axis + 3] + (axis === 0 ? distance : 0));
        }
        const movedEdges = new Set(
          body.faces
            .filter((face) => selection.some((id) => id === face.id))
            .flatMap((face) => face.edges),
        );
        for (const edge of body.edges.filter((edge) => !movedEdges.has(edge.id))) {
          // Edges with one selected endpoint legitimately stretch; whole fixed rims do not.
          if (name !== "hole") continue;
          const after = result.edges.find((candidate) => candidate.id === edge.id);
          assert.ok(after);
          for (let i = 2; i < 6; i++) near(after.signature[i], edge.signature[i]);
        }
        if (name === "hole") near(result.volume, body.volume, 0.001);
        assert.deepEqual(owner.view.data, original);
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const accepted = owner.view.data;
        assert.equal((await owner.call({ kind: "undo" })).error, undefined);
        assert.deepEqual(owner.view.data, original);
        assert.equal((await owner.call({ kind: "redo" })).error, undefined);
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        const reverse = await move(-distance);
        assert.equal(reverse.error, undefined);
        near(reverse.view.candidate?.bodies?.[0].volume ?? NaN, body.volume, 0.001);
        assert.equal((await owner.call({ kind: "open", document: original })).error, undefined);
      }
      const rejected = await move(name === "hole" ? 50 : 28);
      assert.ok(rejected.error);
      assert.equal(rejected.view.candidate, null);
      assert.deepEqual(owner.view.data, original);
    } finally {
      owner.close();
    }
  });
}
