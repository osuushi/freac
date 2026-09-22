import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Extrusion } from "../src/model/body.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/reverse-hole-cut.json", "utf8")) as {
  document: SketchDocument;
  extrusion: Extrusion;
};
async function cut(owner: DocumentOwner, distance: number, mode: Extrusion["mode"] = "auto") {
  const reply = await owner.call({
    kind: "extrude",
    extrusion: { ...fixture.extrusion, distance, mode },
  });
  assert.equal(reply.error, undefined);
  assert.equal(reply.view.candidate?.bodies?.length, 1);
  return reply.view.candidate?.bodies?.[0] as Body;
}
async function probe(owner: DocumentOwner, x: number, y: number, z: number, occupied: boolean) {
  const sketch = {
    ...emptySketch({ ...planes.XY, origin: [0, 0, z - 0.1] }),
    curves: [
      { id: "probe", kind: "circle" as const, center: { x, y }, radius: 0.1, construction: false },
    ],
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const reply = await owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 0.2,
      mode: "intersect",
      targets: [owner.view.data.bodies?.[0].id as string],
    },
  });
  assert.equal(reply.error, undefined);
  const bodies = reply.view.candidate?.bodies ?? [];
  assert.equal(bodies.length, occupied ? 1 : 0, `Material at ${x}, ${y}, ${z}`);
  if (occupied) assert.ok(Math.abs(bodies[0].volume - Math.PI * 0.1 ** 2 * 0.2) < 1e-8);
  await owner.call({ kind: "discard" });
}

test("captured reverse cut completes a tangent hole, keeps source identities and preview lifecycle", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const original = before.bodies?.[0] as Body;
    let through: Body | undefined;
    for (const mode of ["auto", "subtract"] as const) {
      for (const distance of [-10, -25, -35, -40, -65]) {
        const body = await cut(owner, distance, mode);
        assert.equal(owner.view.data, before);
        assert.equal(body.id, original.id);
        if (distance === -10) assert.ok(body.volume > 45000);
        else {
          through ??= body;
          assert.ok(Math.abs(body.volume - through.volume) < 1e-7);
          assert.ok(body.volume > 41768 && body.volume < 41769);
        }
        // The remote planar caps and fillets continue, while the divided
        // cylinder receives new face IDs and the consumed hole bottom disappears.
        for (const f of original.faces.filter(
          (f) => !f.cylinder && f.id !== "d573fdad-8a1b-47a8-b831-417fdf2de37c",
        ))
          assert.ok(body.faces.some((next) => next.id === f.id));
        const ids = [body.id, ...body.faces.map((f) => f.id), ...body.edges.map((e) => e.id)];
        assert.equal(new Set(ids).size, ids.length);
      }
    }
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.data, before);
    await cut(owner, -65);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    const body = owner.view.data.bodies?.[0] as Body;
    assert.deepEqual(
      body.faces.map((f) => f.id),
      after.bodies?.[0].faces.map((f) => f.id),
    );
    const cap = body.faces.find((f) => f.plane?.origin[2] === 54);
    assert.ok(cap);
    const edited = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: cap.id }], distance: -0.2 },
    });
    assert.equal(edited.error, undefined);
    assert.ok(edited.view.candidate);
  } finally {
    owner.close();
  }
});

test("completed captured hole is empty across both directions and retains surrounding material", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    // The reverse side starts solid; the first cut has already emptied +X.
    await probe(owner, -10, 0, 30, true);
    await probe(owner, 10, 0, 30, false);
    await cut(owner, -65);
    await owner.call({ kind: "accept" });
    for (const x of [-19, -10, -0.2, 0.2, 10, 19]) await probe(owner, x, 0, 30, false);
    for (const x of [-10, 10]) {
      await probe(owner, x, 0, 17, true);
      await probe(owner, x, 0, 43, true);
      await probe(owner, x, 13, 30, true);
      await probe(owner, x, -13, 30, true);
    }
  } finally {
    owner.close();
  }
});

test("periodic cut recovery also handles standalone subtraction with cutter identities", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const source = owner.view.data.bodies?.[0] as Body;
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: { ...fixture.extrusion, mode: "new" } }))
        .error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const tool = owner.view.data.bodies?.find((b) => b.id !== source.id) as Body;
    const reply = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [source.id, tool.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.candidate?.bodies?.length, 1);
    assert.ok((reply.view.candidate?.bodies?.[0].volume ?? 0) > 41768);
    assert.ok((reply.view.candidate?.bodies?.[0].volume ?? Infinity) < 41769);
  } finally {
    owner.close();
  }
});

test("captured tangent cut survives reversed world direction and translated placement", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const body = owner.view.data.bodies?.[0] as Body;
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [0, 0, 1],
            pivot: [0, 0, 0],
            angle: 180,
            translation: [11, -7, 3],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = {
      ...owner.view.data,
      sketches: owner.view.data.sketches.map((s) => ({
        ...s,
        plane: {
          origin: [11 - s.plane.origin[0], -7 - s.plane.origin[1], 3 + s.plane.origin[2]] as [
            number,
            number,
            number,
          ],
          u: [-s.plane.u[0], -s.plane.u[1], s.plane.u[2]] as [number, number, number],
          v: [-s.plane.v[0], -s.plane.v[1], s.plane.v[2]] as [number, number, number],
        },
      })),
    };
    assert.equal((await owner.call({ kind: "open", document: moved })).error, undefined);
    const result = await cut(owner, -65);
    assert.ok(result.volume > 41768 && result.volume < 41769);
  } finally {
    owner.close();
  }
});
