import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Face } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

async function plate(owner: DocumentOwner): Promise<Body> {
  await prism(owner, square);
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "hole",
        kind: "circle" as const,
        center: { x: 10, y: 10 },
        radius: 1.5,
        construction: false,
      },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 10,
      mode: "subtract",
    },
  });
  assert.equal(reply.error, undefined);
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
const top = (body: Body) => {
  const face = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
  assert.ok(face);
  return face;
};
async function offset(owner: DocumentOwner, body: Body, faces: Face[], distance: number) {
  return owner.call({
    kind: "offset-faces",
    operation: {
      faces: faces.map((face) => ({ body: body.id, face: face.id })),
      distance,
    },
  });
}
function close(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
}

test("face offset changes hole diameter and retrims neighboring planes, preserving identity and history", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await plate(owner),
      before = owner.view.data;
    const hole = body.faces.find((f) => f.cylinder);
    assert.ok(hole?.cylinder);
    assert.equal(hole.cylinder.outward, -1);
    close(hole.cylinder.radius, 1.5);
    const reply = await offset(owner, body, [hole], -1);
    assert.equal(reply.error, undefined);
    const candidate = reply.view.candidate?.bodies?.[0];
    assert.ok(candidate);
    close(candidate.volume, (400 - Math.PI * 2.5 ** 2) * 10);
    close(candidate.faces.find((f) => f.id === hole.id)?.cylinder?.radius ?? 0, 2.5);
    assert.deepEqual(reply.view.data, before);
    assert.deepEqual(
      new Set(candidate.faces.map((f) => f.id)),
      new Set(body.faces.map((f) => f.id)),
    );
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    close(
      owner.view.data.bodies?.[0].faces.find((f) => f.id === hole.id)?.cylinder?.radius ?? 0,
      2.5,
    );
  } finally {
    owner.close();
  }
});

test("planar offset beside a hole, shared face offsets, zero and collapse recovery are atomic", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await plate(owner),
      face = top(body),
      original = owner.view.data;
    const hole = body.faces.find((f) => f.cylinder);
    assert.ok(hole);
    for (const [faces, distance, expected] of [
      [[face], 2, (400 - Math.PI * 1.5 ** 2) * 12],
      [[face], -2, (400 - Math.PI * 1.5 ** 2) * 8],
      [[face, hole], 1, (400 - Math.PI * 0.5 ** 2) * 11],
    ] as const) {
      const reply = await offset(owner, body, [...faces], distance);
      assert.equal(reply.error, undefined);
      close(reply.view.candidate?.bodies?.[0].volume ?? 0, expected);
      assert.equal(reply.view.data, original);
    }
    for (const [faces, distance] of [
      [[hole], 1.5],
      [[hole], 2],
      [[face], -11],
      [[face], NaN],
    ] as const) {
      const reply = await offset(owner, body, [...faces], distance);
      if (Number.isNaN(distance)) {
        assert.ok(reply.error);
        assert.equal(reply.view.candidate, null);
      } else {
        assert.equal(reply.error, undefined);
        assert.ok(Math.abs(reply.view.offsetDistance ?? Infinity) < Math.abs(distance));
        assert.ok((reply.view.candidate?.bodies?.[0].volume ?? 0) > 0);
      }
      assert.equal(reply.view.data, original);
    }
    assert.equal((await offset(owner, body, [face], 1)).error, undefined);
    await offset(owner, body, [face], 0);
    await owner.call({ kind: "accept" });
    assert.equal(owner.view.data, original);
  } finally {
    owner.close();
  }
});

test("cylindrical boss offsets and tangent face chains use actual support orientation", async () => {
  const owner = new DocumentOwner();
  try {
    const cylinder = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [
        { id: "boss", kind: "circle", center: { x: 40, y: 0 }, radius: 3, construction: false },
      ],
    });
    const side = cylinder.faces.find((f) => f.cylinder);
    assert.ok(side?.cylinder);
    assert.equal(side.cylinder.outward, 1);
    const reply = await offset(owner, cylinder, [side], 2);
    assert.equal(reply.error, undefined);
    close(reply.view.candidate?.bodies?.[0].volume ?? 0, Math.PI * 25 * 10);
    await owner.call({ kind: "discard" });
    const box = await prism(owner, square);
    await finish(owner, box, [vertical(box, 0, 0)], 2);
    await owner.call({ kind: "accept" });
    const rounded = owner.view.data.bodies?.find((b) => b.id === box.id);
    assert.ok(rounded);
    const blend = rounded.faces.find((f) => f.cylinder);
    assert.ok(blend);
    const before = owner.view.data;
    assert.equal(blend.offsetFaces?.length, 3);
    const changed = await offset(owner, rounded, [blend], 0.5);
    assert.equal(changed.error, undefined);
    assert.equal(changed.view.data, before);
    close(
      changed.view.candidate?.bodies?.find((b) => b.id === box.id)?.volume ?? 0,
      (20.5 ** 2 - 2.5 ** 2 * (1 - Math.PI / 4)) * 10,
    );
    const chain = rounded.faces.filter((f) => blend.offsetFaces?.includes(f.id));
    for (const seed of chain) {
      assert.deepEqual(new Set(seed.offsetFaces), new Set(blend.offsetFaces));
      const fromSeed = await offset(owner, rounded, [seed], 0.5);
      assert.equal(fromSeed.error, undefined);
      close(
        fromSeed.view.candidate?.bodies?.find((b) => b.id === box.id)?.volume ?? 0,
        changed.view.candidate?.bodies?.find((b) => b.id === box.id)?.volume ?? 0,
      );
    }
  } finally {
    owner.close();
  }
});

test("multiple bodies offset atomically; tangent neighbors may be explicitly included", async () => {
  const owner = new DocumentOwner();
  try {
    const first = await prism(owner, square);
    const second = await prism(owner, [
      [30, 0],
      [50, 0],
      [50, 20],
      [30, 20],
    ]);
    const original = owner.view.data;
    const faces = [first, second].map((b) => ({ body: b.id, face: top(b).id }));
    const result = await owner.call({ kind: "offset-faces", operation: { faces, distance: 2 } });
    assert.equal(result.error, undefined);
    assert.deepEqual(
      result.view.candidate?.bodies?.map((b) => b.id),
      [first.id, second.id],
    );
    for (const body of result.view.candidate?.bodies ?? []) close(body.volume, 4800);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await finish(owner, first, [vertical(first, 0, 0)], 2);
    await owner.call({ kind: "accept" });
    const rounded = owner.view.data.bodies?.find((b) => b.id === first.id);
    assert.ok(rounded);
    const selected = rounded.faces.filter(
      (f) =>
        f.cylinder ||
        (f.plane?.origin.every((v) => Math.abs(v) < 1e-7) &&
          Math.abs(f.plane.u[2]) + Math.abs(f.plane.v[2]) > 0.9),
    );
    assert.equal(selected.length, 3);
    const changed = await offset(owner, rounded, selected, 0.5);
    assert.equal(changed.error, undefined);
    close(
      changed.view.candidate?.bodies?.find((b) => b.id === first.id)?.volume ?? 0,
      (20.5 ** 2 - 2.5 ** 2 * (1 - Math.PI / 4)) * 10,
    );
    const malformed = await owner.call({
      kind: "offset-faces",
      operation: { faces: [...faces, { body: second.id, face: "missing" }], distance: 1 },
    });
    assert.match(malformed.error ?? "", /belong/);
    assert.equal(malformed.view.candidate, null);
  } finally {
    owner.close();
  }
});
