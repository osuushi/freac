import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism, square } from "./body-edge-fixtures.js";

async function fixture(owner: DocumentOwner, sides: number, boss: boolean, through = false) {
  await prism(owner, square);
  const points =
    sides === -6
      ? [
          { x: 8, y: 8 },
          { x: 12, y: 8 },
          { x: 12, y: 10 },
          { x: 10, y: 10 },
          { x: 10, y: 12 },
          { x: 8, y: 12 },
        ]
      : Array.from({ length: sides }, (_, i) => ({
          x: 10 + 2 * Math.cos((2 * Math.PI * i) / sides),
          y: 10 + 2 * Math.sin((2 * Math.PI * i) / sides),
        }));
  const sketch: Sketch = {
    ...emptySketch({ ...planes.XY, origin: [0, 0, 10] }),
    curves: sides
      ? points.map((a, i) => ({
          id: `side${i}`,
          kind: "segment",
          a,
          b: points[(i + 1) % points.length],
          construction: false,
        }))
      : [
          {
            id: "circle",
            kind: "circle",
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
          distance: boss ? 4 : through ? -10 : -4,
          mode: boss ? "union" : "subtract",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const faces = body.faces.filter(
    (face) =>
      ![0, 1, 2].some((axis) =>
        [0, axis === 2 ? 10 : 20].some((n) =>
          face.vertices.every((v, i) => i % 3 !== axis || Math.abs(v - n) < 1e-6),
        ),
      ),
  );
  assert.equal(faces.length, (sides ? Math.abs(sides) : 1) + (through ? 0 : 1));
  return { body, faces };
}

for (const sides of [3, 6, 0, -6, 4])
  for (const mode of ["boss", "pocket", "through"]) {
    const boss = mode === "boss",
      through = mode === "through";
    test(`${sides || "round"} ${mode} move continues IDs, history and re-edit after reopen`, async () => {
      const owner = new DocumentOwner();
      try {
        const { body, faces } = await fixture(owner, sides, boss, through);
        const original = owner.view.data;
        const operation = {
          faces: faces.map((f) => ({ body: body.id, face: f.id })),
          pivot: [10, 10, 10] as [number, number, number],
          axis: [0, 0, 1] as [number, number, number],
          angle: 15,
          translation: [2, 0, 0] as [number, number, number],
        };
        const reply = await owner.call({ kind: "move-faces", operation });
        assert.equal(reply.error, undefined);
        const moved = reply.view.candidate?.bodies?.[0];
        assert.ok(moved);
        assert.deepEqual(owner.view.data, original);
        assert.equal(moved.id, body.id);
        assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
        assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
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
          operation: {
            ...operation,
            pivot: [12, 10, 10],
            angle: -15,
            translation: [-2, 0, 0],
          },
        });
        assert.equal(reverse.error, undefined);
        const restored = reverse.view.candidate?.bodies?.[0];
        assert.ok(restored);
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(restored.center[i] - body.center[i]) < 1e-6);
        assert.equal((await owner.call({ kind: "discard" })).error, undefined);
        assert.deepEqual(owner.view.data, reopened);
      } finally {
        owner.close();
      }
    });
  }
