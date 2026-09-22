import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Face, FaceMovement } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { finish, prism, square } from "./body-edge-fixtures.js";

test("captured filleted pocket moves rigidly with IDs, invalid recovery, history and reopen", async () => {
  const fixture: { document: SketchDocument; operation: FaceMovement } = JSON.parse(
    readFileSync("tests/fixtures/filleted-pocket-move.json", "utf8"),
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    const request = { kind: "move-faces" as const, operation: fixture.operation };
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    const moved = reply.view.candidate?.bodies?.[0];
    assert.ok(moved);
    assert.deepEqual(owner.view.data, original);
    assert.ok(Math.abs(body.volume - moved.volume) < 1e-6);
    assert.deepEqual(body.faces.map((f) => f.id).sort(), moved.faces.map((f) => f.id).sort());
    for (const selected of fixture.operation.faces) {
      const before: Face | undefined = body.faces.find((f) => f.id === selected.face);
      const after: Face | undefined = moved.faces.find((f) => f.id === selected.face);
      assert.ok(before && after);
      assert.ok(Math.abs(before.signature[2] - after.signature[2]) < 1e-6);
      for (let i = 0; i < 3; i++)
        assert.ok(Math.abs(after.signature[3 + i] - before.signature[3 + i] - [0, 9, 0][i]) < 1e-6);
      if (before.cylinder) assert.equal(after.cylinder?.radius, before.cylinder.radius);
    }
    for (const translation of [
      [0, 50, 0],
      [0, 0, 1],
    ] as [number, number, number][]) {
      assert.ok(
        (await owner.call({ ...request, operation: { ...fixture.operation, translation } })).error,
      );
      assert.deepEqual(owner.view.data, original);
    }
    // Complete-feature selection is no longer an eligibility rule. The omitted
    // face reconnects to the selected boundaries through the same operation.
    const partial = await owner.call({
      ...request,
      operation: { ...fixture.operation, faces: fixture.operation.faces.slice(1) },
    });
    assert.equal(partial.error, undefined);
    assert.ok(partial.view.candidate);
    assert.deepEqual(owner.view.data, original);
    assert.equal((await owner.call(request)).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const reverse = await owner.call({
      ...request,
      operation: { ...fixture.operation, translation: [0, -9, 0] },
    });
    assert.equal(reverse.error, undefined);
    const restored = reverse.view.candidate?.bodies?.[0];
    assert.ok(restored);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(restored.center[i] - body.center[i]) < 1e-6);
    await owner.call({ kind: "discard" });
  } finally {
    owner.close();
  }
});

for (const boss of [false, true])
  test(`round ${boss ? "boss" : "pocket"} with toroidal fillet retains curved face IDs`, async () => {
    const owner = new DocumentOwner();
    try {
      await prism(owner, square);
      const sketch = {
        ...emptySketch({ ...planes.XY, origin: [0, 0, 10] as [number, number, number] }),
        curves: [
          {
            id: "circle",
            kind: "circle" as const,
            center: { x: 10, y: 10 },
            radius: 2,
            construction: false,
          },
        ],
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "extrude",
            extrusion: {
              sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
              distance: boss ? 4 : -4,
              mode: boss ? "union" : "subtract",
            },
          })
        ).error,
        undefined,
      );
      await owner.call({ kind: "accept" });
      const sharp = owner.view.data.bodies?.[0];
      assert.ok(sharp);
      const rim = sharp.edges.find(
        (e) =>
          e.curve?.kind === "circle" &&
          e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - (boss ? 14 : 6)) < 1e-6),
      );
      assert.ok(rim);
      const rounded = await finish(owner, sharp, [rim], 0.5);
      await owner.call({ kind: "accept" });
      const faces = rounded.faces.filter(
        (f) =>
          ![0, 1, 2].some((axis) =>
            [0, axis === 2 ? 10 : 20].some((n) =>
              f.vertices.every((v, i) => i % 3 !== axis || Math.abs(v - n) < 1e-6),
            ),
          ),
      );
      assert.equal(faces.length, 3);
      assert.ok(faces.some((f) => !f.plane && !f.cylinder));
      const operation: FaceMovement = {
        faces: faces.map((f) => ({ body: rounded.id, face: f.id })),
        pivot: [10, 10, 10],
        axis: [0, 0, 1],
        angle: 17,
        translation: [3, 1, 0],
      };
      const reply = await owner.call({ kind: "move-faces", operation });
      assert.equal(reply.error, undefined);
      const moved = reply.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.ok(Math.abs(moved.volume - rounded.volume) < 1e-6);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), rounded.faces.map((f) => f.id).sort());
      await owner.call({ kind: "accept" });
      assert.equal(
        (await owner.call({ kind: "open", document: owner.view.data })).error,
        undefined,
      );
      const reverse = await owner.call({
        kind: "move-faces",
        operation: {
          ...operation,
          pivot: [13, 11, 10],
          angle: -17,
          translation: [-3, -1, 0],
        },
      });
      assert.equal(reverse.error, undefined);
      const restored = reverse.view.candidate?.bodies?.[0];
      assert.ok(restored);
      for (let i = 0; i < 3; i++)
        assert.ok(Math.abs(restored.center[i] - rounded.center[i]) < 1e-6);
    } finally {
      owner.close();
    }
  });
