import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

function rectangle(x: number, y: number, X: number, Y: number): Sketch {
  const points = [
    { x, y },
    { x: X, y },
    { x: X, y: Y },
    { x, y: Y },
  ];
  return {
    ...emptySketch(planes.XY),
    curves: points.map((a, i) => ({
      id: `edge${i}`,
      kind: "segment",
      a,
      b: points[(i + 1) % 4],
      construction: false,
    })),
  };
}
test("materialized extrusion is temporary, splits into solids and is independent of its sketch", async () => {
  const owner = new DocumentOwner();
  try {
    const plate = rectangle(0, 0, 30, 20);
    assert.equal((await owner.call({ kind: "edit", sketch: plate })).error, undefined);
    const lift = (sketch: Sketch, distance: number) =>
      owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance,
          mode: "auto",
        },
      });
    const preview = await lift(plate, 5);
    assert.equal(preview.error, undefined);
    assert.equal(preview.view.booleanMode, "union");
    assert.equal(preview.view.data.bodies?.length ?? 0, 0);
    assert.equal(preview.view.candidate?.bodies?.[0].volume, 3000);
    await owner.call({ kind: "accept" });
    const original = owner.view.data.bodies;
    await owner.call({
      kind: "place-sketch",
      sketchId: plate.id,
      frame: { ...planes.XY, origin: [0, 0, 20] },
    });
    assert.deepEqual(owner.view.data.bodies, original);
    const cutter = rectangle(14, -1, 16, 21);
    await owner.call({ kind: "edit", sketch: cutter });
    const split = await lift(cutter, 10);
    assert.equal(split.error, undefined);
    assert.equal(split.view.booleanMode, "subtract");
    assert.equal(split.view.candidate?.bodies?.length, 2);
    for (const body of split.view.candidate?.bodies ?? []) {
      assert.ok(Math.abs(body.volume - 1400) < 1e-7);
      assert.ok(body.faces.every((face) => face.plane));
    }
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.bodies, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data.bodies?.length, 2);
  } finally {
    owner.close();
  }
});

test("save/open validates exact bodies and preserves identity without replaying sketches", async () => {
  const owner = new DocumentOwner();
  const reopened = new DocumentOwner();
  try {
    const sketch = rectangle(0, 0, 10, 10);
    await owner.call({ kind: "edit", sketch });
    await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: -4,
        mode: "new",
      },
    });
    await owner.call({ kind: "accept" });
    const archive = JSON.parse(JSON.stringify(owner.view.data));
    archive.sketches = [];
    const result = await reopened.call({ kind: "open", document: archive });
    assert.equal(result.error, undefined);
    const body = result.view.data.bodies?.[0];
    assert.ok(Math.abs((body?.volume ?? 0) - 400) < 1e-7);
    assert.equal(body?.id, archive.bodies[0].id);
    assert.deepEqual(
      body?.faces.map((face) => face.id),
      archive.bodies[0].faces.map((face: { id: string }) => face.id),
    );
    assert.ok(Math.abs((body?.bounds[2] ?? 0) + 4) < 1e-6);
    archive.bodies[0].brep = "not a body";
    assert.ok((await reopened.call({ kind: "open", document: archive })).error);
    assert.equal(reopened.view.data.bodies?.[0].id, body?.id);
  } finally {
    owner.close();
    reopened.close();
  }
});

test("Boolean target choice, touching union and empty intersection use exact solids", async () => {
  const owner = new DocumentOwner();
  const lift = async (
    sketch: Sketch,
    mode: "new" | "union" | "subtract" | "intersect",
    targets?: string[],
  ) => {
    await owner.call({ kind: "edit", sketch });
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 5,
        mode,
        targets,
      },
    });
    assert.equal(reply.error, undefined);
    return reply;
  };
  try {
    await lift(rectangle(0, 0, 10, 10), "new");
    await owner.call({ kind: "accept" });
    await lift(rectangle(20, 0, 30, 10), "new");
    await owner.call({ kind: "accept" });
    const bodies = owner.view.data.bodies ?? [];
    let reply = await lift(rectangle(5, -1, 25, 11), "subtract", [bodies[0].id]);
    assert.deepEqual(reply.view.booleanTargets, [bodies[0].id]);
    assert.equal(reply.view.candidate?.bodies?.length, 2);
    assert.equal(
      reply.view.candidate?.bodies?.find((b) => b.id === bodies[1].id)?.brep,
      bodies[1].brep,
    );
    await owner.call({ kind: "discard" });
    reply = await lift(rectangle(10, 0, 20, 10), "union");
    assert.equal(reply.view.candidate?.bodies?.length, 1);
    assert.ok(Math.abs((reply.view.candidate?.bodies?.[0].volume ?? 0) - 1500) < 1e-6);
    await owner.call({ kind: "discard" });
    reply = await lift(rectangle(40, 0, 50, 10), "intersect", [bodies[0].id]);
    assert.equal(reply.view.candidate?.bodies?.length, 1);
    assert.equal(reply.view.candidate?.bodies?.[0].id, bodies[1].id);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length, 2);
  } finally {
    owner.close();
  }
});
