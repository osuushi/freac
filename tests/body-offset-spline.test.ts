import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { NativeCalculator } from "../src/backend/native-calculator.js";
import type { Body, BodyFaceOffset } from "../src/model/body.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/offset-bent-shell.json", "utf8")) as {
  document: SketchDocument;
  operation: BodyFaceOffset;
};
async function open(owner: DocumentOwner): Promise<Body> {
  assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
async function offset(owner: DocumentOwner, distance: number, faces = fixture.operation.faces) {
  const reply = await owner.call({ kind: "offset-faces", operation: { faces, distance } });
  assert.equal(reply.error, undefined);
  assert.equal(
    reply.view.offsetDistance,
    distance,
    "Must achieve the requested distance without clamping",
  );
  const body = reply.view.candidate?.bodies?.[0];
  assert.ok(body);
  return body;
}
async function probe(owner: DocumentOwner, x: number, y: number, z: number, occupied: boolean) {
  const sketch = {
    ...emptySketch({ ...planes.XY, origin: [0, 0, z - 0.05] }),
    curves: [
      { id: "probe", kind: "circle" as const, center: { x, y }, radius: 0.05, construction: false },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 0.1,
      mode: "intersect",
      targets: [owner.view.data.bodies?.[0].id as string],
    },
  });
  assert.equal(reply.error, undefined);
  const bodies = reply.view.candidate?.bodies ?? [];
  assert.equal(bodies.length, occupied ? 1 : 0, `Material at ${x},${y},${z}`);
  if (occupied) assert.ok(Math.abs(bodies[0].volume - Math.PI * 0.05 ** 2 * 0.1) < 1e-9);
  await owner.call({ kind: "discard" });
}

test("captured hollow spline offsets its inner tangent chain with signed normal distance", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await open(owner),
      before = owner.view.data;
    for (const distance of [-1, 0.5, 1, 2, 7.5]) {
      const body = await offset(owner, distance);
      assert.equal(owner.view.data, before);
      assert.equal(owner.view.data.bodies?.[0].brep, original.brep);
      assert.equal(
        body.faces.length,
        original.faces.length,
        "Caps retrim without rounded transition faces",
      );
      for (const face of original.faces) assert.ok(body.faces.some((f) => f.id === face.id));
      for (const f of body.faces.filter((f) => f.cylinder)) {
        const selected = fixture.operation.faces.some((entry) => entry.face === f.id);
        assert.ok(Math.abs((f.cylinder?.radius ?? 0) - (selected ? 8 - distance : 9.5)) < 1e-6);
      }
      for (const cap of body.faces.filter((f) => f.plane))
        assert.ok(Math.abs(cap.signature[2] - Math.PI * (9.5 ** 2 - (8 - distance) ** 2)) < 1e-5);
      const expected = (original.volume * (9.5 ** 2 - (8 - distance) ** 2)) / (9.5 ** 2 - 8 ** 2);
      assert.ok(Math.abs(body.volume - expected) < 0.001, `${body.volume} vs ${expected}`);
      await owner.call({ kind: "discard" });
    }
    // A single seed uses the same existing tangent-chain selection semantics.
    await offset(owner, 1, fixture.operation.faces.slice(0, 1));
    assert.equal(owner.view.offsetSelection?.length, 3);
  } finally {
    owner.close();
  }
});

test("captured spline offset preserves the outer wall and changes material through the bend", async () => {
  const owner = new DocumentOwner();
  try {
    for (const distance of [-1, 1]) {
      await open(owner);
      await offset(owner, distance);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      for (const [x, y] of [
        [-15, 5],
        [0, 15.858],
        [15, 5],
      ]) {
        await probe(owner, x, y, 8 - distance - 0.2, false);
        await probe(owner, x, y, 8 - distance + 0.2, true);
        await probe(owner, x, y, 9.3, true);
        await probe(owner, x, y, 9.7, false);
      }
    }
  } finally {
    owner.close();
  }
});

test("captured offset supports history, reopened offset surfaces, reversal and moved placement", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await open(owner),
      before = owner.view.data;
    const first = await offset(owner, 1);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    assert.deepEqual(
      owner.view.data.bodies?.[0].faces.map((f) => f.id),
      first.faces.map((f) => f.id),
    );
    const reversed = await offset(owner, -1);
    assert.ok(Math.abs(reversed.volume - source.volume) < 1e-4);
    await owner.call({ kind: "discard" });
    await open(owner);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [source.id],
            axis: [1, 2, 3],
            pivot: [0, 0, 0],
            angle: 57,
            translation: [20, -30, 40],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = await offset(owner, 1);
    assert.ok(Math.abs(moved.volume - first.volume) < 1e-4);
  } finally {
    owner.close();
  }
});

test("native freeform offset rejects wall crossing and radius collapse at the requested distance", async () => {
  const kernel = new NativeCalculator(
    resolve(".build/kernel/bin/freac-kernel"),
    "Offset regression",
  );
  try {
    for (const distance of [-1.5, -2, 8, 9])
      await assert.rejects(
        kernel.calculate({
          kind: "offset-faces",
          bodies: fixture.document.bodies,
          ...fixture.operation,
          distance,
        }),
      );
  } finally {
    kernel.close();
  }
});

test("captured outer offset surface edits independently of the inner spline chain", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await open(owner);
    const outer = original.faces.find((f) => f.cylinder?.radius === 9.5);
    assert.ok(outer?.offsetFaces);
    const faces = outer.offsetFaces.map((face) => ({ body: original.id, face }));
    for (const distance of [-0.5, 0.2]) {
      const result = await offset(owner, distance, faces);
      for (const face of result.faces.filter((f) => f.cylinder)) {
        const selected = faces.some((f) => f.face === face.id);
        assert.ok(Math.abs((face.cylinder?.radius ?? 0) - (selected ? 9.5 + distance : 8)) < 1e-6);
      }
      const expected = (original.volume * ((9.5 + distance) ** 2 - 8 ** 2)) / (9.5 ** 2 - 8 ** 2);
      assert.ok(Math.abs(result.volume - expected) < 0.001);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});
