import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { mirrorSketch } from "../src/backend/mirror-sketch.js";
import type { MirrorOperation } from "../src/model/mirror.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("body mirror is exact, temporary, positive and editable with atomic undo and reopen", async () => {
  const owner = new DocumentOwner();
  try {
    await createBody(owner);
    const original = owner.view.data,
      body = original.bodies?.[0];
    assert.ok(body);
    const mirror: MirrorOperation = {
      kind: "bodies",
      ids: [body.id],
      plane: { origin: [2, 0, 0], normal: [1, 0, 0] },
      keepOriginal: true,
    };
    assert.equal((await owner.call({ kind: "mirror", operation: mirror })).error, undefined);
    assert.deepEqual(owner.view.data, original);
    const copy = owner.view.candidate?.bodies?.[1];
    assert.ok(copy);
    assert.ok(Math.abs(copy.center[0] - (4 - body.center[0])) < 1e-8);
    assert.ok(Math.abs(copy.volume - body.volume) < 1e-7);
    assert.ok(copy.volume > 0);
    assert.equal(copy.faces.length, body.faces.length);
    const ids = new Set([body.id, ...body.faces.map((f) => f.id), ...body.edges.map((e) => e.id)]);
    assert.ok(
      [copy.id, ...copy.faces.map((f) => f.id), ...copy.edges.map((e) => e.id)].every(
        (id) => !ids.has(id),
      ),
    );
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "mirror", operation: mirror });
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal(
      (await owner.call({ kind: "open", document: JSON.parse(JSON.stringify(accepted)) })).error,
      undefined,
    );
    const replacement = {
      ...mirror,
      keepOriginal: false,
      plane: {
        origin: [1, 2, 3] as [number, number, number],
        normal: [1, 1, 1] as [number, number, number],
      },
    };
    assert.equal((await owner.call({ kind: "mirror", operation: replacement })).error, undefined);
    await owner.call({ kind: "accept" });
    const reflected = owner.view.data.bodies?.find((b) => b.id === body.id);
    assert.ok(reflected);
    assert.deepEqual(reflected.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
    assert.deepEqual(reflected.edges.map((e) => e.id).sort(), body.edges.map((e) => e.id).sort());
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [0, 0, 1],
            pivot: [0, 0, 0],
            angle: 15,
            translation: [0, 0, 2],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const beforeFailure = owner.view.data;
    assert.ok(
      (await owner.call({ kind: "mirror", operation: { ...mirror, ids: [body.id, "missing"] } }))
        .error,
    );
    assert.deepEqual(owner.view.data, beforeFailure);
    assert.equal(owner.view.candidate, null);
    assert.ok(
      (
        await owner.call({
          kind: "mirror",
          operation: { ...mirror, plane: { ...mirror.plane, normal: [0, 0, 0] } },
        })
      ).error,
    );
  } finally {
    owner.close();
  }
});

async function createBody(owner: DocumentOwner) {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "outer", kind: "circle", center: { x: 8, y: 3 }, radius: 4, construction: false },
      { id: "hole", kind: "circle", center: { x: 9, y: 3 }, radius: 1, construction: false },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: 7,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
}

test("mirror copies retain source selection order across curves and multiple bodies", async () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "one", kind: "circle", center: { x: 3, y: 0 }, radius: 1, construction: false },
      { id: "two", kind: "circle", center: { x: 8, y: 0 }, radius: 2, construction: false },
    ],
  };
  const copied = mirrorSketch(sketch, {
    kind: "sketch",
    sketchId: sketch.id,
    ids: ["two", "one"],
    line: { origin: { x: 2, y: 0 }, direction: { x: 0, y: 1 } },
    keepOriginal: true,
  });
  assert.ok(copied.curves[2].kind === "circle" && copied.curves[3].kind === "circle");
  assert.equal(copied.curves[2].radius, 2);
  assert.equal(copied.curves[3].radius, 1);
  const owner = new DocumentOwner();
  try {
    await createBody(owner);
    const original = owner.view.data.bodies?.[0];
    assert.ok(original);
    await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [original.id],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        translation: [20, 0, 0],
        duplicate: true,
      },
    });
    const second = owner.view.data.bodies?.[1];
    assert.ok(second);
    assert.equal(
      (
        await owner.call({
          kind: "mirror",
          operation: {
            kind: "bodies",
            ids: [second.id, original.id],
            plane: { origin: [0, 0, 0], normal: [1, 0, 0] },
            keepOriginal: true,
          },
        })
      ).error,
      undefined,
    );
    const bodies = owner.view.candidate?.bodies;
    assert.ok(bodies);
    assert.equal(bodies.length, 4);
    assert.ok(Math.abs(bodies[2].center[0] + second.center[0]) < 1e-7);
    assert.ok(Math.abs(bodies[3].center[0] + original.center[0]) < 1e-7);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length, 2);
  } finally {
    owner.close();
  }
});
