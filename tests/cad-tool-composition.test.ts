import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply;
}
async function scaledSymmetricBody(owner: DocumentOwner): Promise<Body> {
  const frame = { ...planes.XY, origin: [0, 0, 5] as [number, number, number] };
  await call(owner, { kind: "construction-plane", plane: { id: "reference", frame } });
  const sketch = rectangle(
    emptySketch(structuredClone(frame)),
    { x: -5, y: -5 },
    { x: 5, y: 5 },
  ).sketch;
  await call(owner, { kind: "edit", sketch });
  await call(owner, {
    kind: "scale",
    operation: { kind: "sketches", ids: [sketch.id], pivot: [0, 0, 5], factor: 2 },
  });
  await call(owner, { kind: "accept" });
  assert.deepEqual(owner.view.data.constructionPlanes, [{ id: "reference", frame }]);
  const source = owner.view.data.sketches[0];
  await call(owner, {
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: source.id, profile: profilesFor(source)[0].key }],
      distance: 12,
      symmetric: true,
      mode: "new",
    },
  });
  const preview = owner.view.candidate?.bodies?.[0];
  assert.ok(preview);
  near(preview.volume, 4800);
  near(preview.bounds[2], -1);
  near(preview.bounds[5], 11);
  await call(owner, { kind: "accept" });
  return preview;
}

test("plane, Scale, symmetric Extrude, Imprint and Split compose without coupling the reference", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await scaledSymmetricBody(owner);
    const before = owner.view.data;
    await call(owner, {
      kind: "scale",
      operation: {
        kind: "solids",
        ids: [body.id],
        faces: [],
        edges: [],
        pivot: [0, 0, 5],
        factor: 0.5,
      },
    });
    assert.deepEqual(owner.view.data, before, "Scale remains temporary");
    await call(owner, { kind: "accept" });
    const after = owner.view.data;
    const scaled = after.bodies?.[0];
    assert.ok(scaled);
    near(scaled.volume, 600);
    near(scaled.bounds[2], 2);
    near(scaled.bounds[5], 8);
    assert.deepEqual(after.sketches, before.sketches);
    assert.deepEqual(after.constructionPlanes, before.constructionPlanes);
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await call(owner, { kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    await call(owner, { kind: "open", document: structuredClone(after) });
    assert.deepEqual(owner.view.data.constructionPlanes, after.constructionPlanes);
    await call(owner, {
      kind: "construction-plane",
      plane: { id: "reference", frame: { ...planes.XY, origin: [0, 0, 30] } },
    });
    assert.deepEqual(owner.view.data.sketches, after.sketches);
    near(owner.view.data.bodies?.[0].volume ?? 0, 600);
    await call(owner, { kind: "delete-plane", id: "reference" });
    assert.equal(owner.view.data.constructionPlanes?.length, 0);
    near(owner.view.data.bodies?.[0].volume ?? 0, 600);
    await cutScaledBody(owner);
  } finally {
    owner.close();
  }
});

async function cutScaledBody(owner: DocumentOwner): Promise<void> {
  const source = owner.view.data;
  const body = source.bodies?.[0];
  assert.ok(body);
  await call(owner, {
    kind: "plane-cut",
    operation: {
      mode: "imprint",
      targets: [{ body: body.id }],
      frame: { ...planes.XY, origin: [0, 0, 6] },
    },
  });
  assert.deepEqual(owner.view.data, source);
  const imprinted = owner.view.candidate?.bodies?.[0];
  assert.ok(imprinted);
  near(imprinted.volume, 600);
  assert.ok(imprinted.faces.length > body.faces.length);
  assert.equal(imprinted.id, body.id);
  await call(owner, { kind: "accept" });
  const beforeSplit = owner.view.data;
  await call(owner, {
    kind: "plane-cut",
    operation: { mode: "split", targets: [{ body: body.id }], frame: planes.YZ },
  });
  const pieces = owner.view.candidate?.bodies;
  assert.equal(pieces?.length, 2);
  for (const piece of pieces ?? []) near(piece.volume, 300);
  await call(owner, { kind: "accept" });
  await call(owner, { kind: "undo" });
  assert.deepEqual(owner.view.data, beforeSplit);
  await call(owner, { kind: "redo" });
  assert.equal(owner.view.data.bodies?.length, 2);
  assert.deepEqual(owner.view.data.sketches, source.sketches);
}
