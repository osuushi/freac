import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, FaceMovement } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { type PlaneFrame, planes, type Vector } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const cases = [
  { name: "small", side: 0.004, height: 0.004, delta: 0.001, origin: [0, 0, 0] },
  { name: "ordinary", side: 20, height: 5, delta: 1, origin: [100, -50, 30] },
  { name: "large translated", side: 2000, height: 500, delta: 10, origin: [2e6, -1e6, 1e4] },
] as const;

function volume(body: Body, expected: number): void {
  assert.ok(
    Math.abs(body.volume - expected) <= expected * 1e-8,
    `${body.volume} vs ${expected} mm³`,
  );
}

function topFace(body: Body) {
  const top = body.faces.find(
    (face) =>
      face.plane &&
      face.vertices.every((value, i) => i % 3 !== 2 || Math.abs(value - body.bounds[5]) < 1e-7),
  );
  assert.ok(top);
  return top;
}

async function create(owner: DocumentOwner, side: number, height: number, frame: PlaneFrame) {
  const sketch = rectangle(emptySketch(frame), { x: 0, y: 0 }, { x: side, y: side }).sketch;
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: height,
      mode: "new",
    },
  });
  assert.equal(reply.error, undefined);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}

async function reconnect(
  owner: DocumentOwner,
  source: Body,
  side: number,
  height: number,
  delta: number,
) {
  const before = owner.view.data;
  const operation: FaceMovement = {
    faces: [{ body: source.id, face: topFace(source).id }],
    translation: [0, 0, delta],
    pivot: [0, 0, 0],
    axis: [0, 0, 1],
    angle: 0,
  };
  const reply = await owner.call({ kind: "move-faces", operation });
  assert.equal(reply.error, undefined, `Reconnection: ${reply.error}`);
  const changed = reply.view.candidate?.bodies?.[0];
  assert.ok(changed);
  volume(changed, side * side * (height + delta));
  assert.deepEqual(
    changed.faces.map((face) => face.id).sort(),
    source.faces.map((face) => face.id).sort(),
  );
  assert.deepEqual(
    changed.edges.map((edge) => edge.id).sort(),
    source.edges.map((edge) => edge.id).sort(),
  );
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const accepted = owner.view.data;
  await owner.call({ kind: "undo" });
  assert.deepEqual(owner.view.data, before);
  const invalid = await owner.call({
    kind: "move-faces",
    operation: { ...operation, translation: [0, 0, -height] },
  });
  assert.ok(invalid.error, "Collapsing the two caps onto one plane must reject");
  assert.deepEqual(owner.view.data, before);
  assert.equal(owner.view.canRedo, true);
  await owner.call({ kind: "redo" });
  assert.deepEqual(owner.view.data, accepted);
  assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  const reverse = await owner.call({
    kind: "move-faces",
    operation: { ...operation, translation: [0, 0, -delta] },
  });
  assert.equal(reverse.error, undefined, `Reverse after reopening: ${reverse.error}`);
  assert.ok(reverse.view.candidate?.bodies?.[0]);
  volume(reverse.view.candidate.bodies[0], side * side * height);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
}

async function offsetAndProject(owner: DocumentOwner, side: number, height: number, delta: number) {
  const source = owner.view.data.bodies?.[0];
  assert.ok(source);
  const cap = topFace(source);
  const offset = await owner.call({
    kind: "offset-faces",
    operation: { faces: [{ body: source.id, face: cap.id }], distance: delta },
  });
  assert.equal(offset.error, undefined);
  assert.ok(offset.view.candidate?.bodies?.[0]);
  volume(offset.view.candidate.bodies[0], side * side * (height + delta));
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const accepted = owner.view.data;
  assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  const reopened = owner.view.data;
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const top = topFace(body);
  const frame: PlaneFrame = {
    ...planes.XY,
    origin: [body.bounds[0], body.bounds[1], body.bounds[5] + height],
  };
  const projected = await owner.call({
    kind: "project",
    projection: { sources: [{ kind: "face", body: body.id, face: top.id }], frame },
  });
  assert.equal(projected.error, undefined);
  const sketch = projected.view.candidate?.sketches.at(-1);
  assert.ok(sketch);
  assert.equal(sketch.curves.length, 4);
  const profiles = profilesFor(sketch);
  assert.equal(profiles.length, 1);
  assert.ok(Math.abs(profiles[0].area - side * side) < side * side * 1e-8);
  await owner.call({ kind: "cancel-preview" });
  assert.equal(owner.view.data, reopened);
}

for (const { name, side, height, delta, origin } of cases)
  test(`${name} exact solids retain geometry across editing and reopening`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = await create(owner, side, height, { ...planes.XY, origin: [...origin] });
      volume(body, side * side * height);
      const translation: Vector = [side / 4, -side / 4, height / 4];
      const moved = await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [body.id],
          translation,
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
          duplicate: false,
        },
      });
      assert.equal(moved.error, undefined);
      const transformed = moved.view.data.bodies?.[0];
      assert.ok(transformed);
      volume(transformed, side * side * height);
      for (let i = 0; i < 3; i++)
        assert.ok(Math.abs(transformed.center[i] - body.center[i] - translation[i]) < 1e-7);
      const saved = owner.view.data;
      assert.equal((await owner.call({ kind: "open", document: saved })).error, undefined);
      const source = owner.view.data.bodies?.[0];
      assert.ok(source);
      await reconnect(owner, source, side, height, delta);
      await offsetAndProject(owner, side, height, delta);
    } finally {
      owner.close();
    }
  });
