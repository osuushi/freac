import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { ExtrusionDraft } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism, square } from "./body-edge-fixtures.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test("draft uses per-wall end offset, angle conversion and either extrusion direction", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await prism(owner, square);
    const top = original.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
    assert.ok(top);
    for (const distance of [10, -10])
      for (const offset of [2, -2]) {
        for (const draft of [
          { mode: "offset", value: offset },
          { mode: "angle", value: (Math.atan(offset / Math.abs(distance)) * 180) / Math.PI },
        ] as ExtrusionDraft[]) {
          const reply = await owner.call({
            kind: "extrude",
            extrusion: {
              sources: [{ face: top.id }],
              distance,
              mode: "new",
              draft,
            },
          });
          assert.equal(reply.error, undefined);
          const body = reply.view.candidate?.bodies?.at(-1);
          assert.ok(body);
          const end = 20 + 2 * offset;
          close(body.volume, (Math.abs(distance) * (400 + 20 * end + end * end)) / 3);
          assert.equal(body.faces.length, 6);
          assert.deepEqual(reply.view.data.bodies, [original]);
        }
      }
  } finally {
    owner.close();
  }
});

async function circular(owner: DocumentOwner, hole: boolean, draft: ExtrusionDraft) {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [5, ...(hole ? [2] : [])].map((radius, i) => ({
      id: `circle${i}`,
      kind: "circle",
      center: { x: 0, y: 0 },
      radius,
      construction: false,
    })),
  };
  await owner.call({ kind: "edit", sketch });
  const profile = profilesFor(sketch).find((p) => p.holes.length === (hole ? 1 : 0));
  assert.ok(profile);
  return owner.call({
    kind: "extrude",
    extrusion: {
      sources: [{ sketch: sketch.id, profile: profile.key }],
      distance: 10,
      mode: "new",
      draft,
    },
  });
}

test("draft expands circular material and contracts holes without changing the source", async () => {
  const owner = new DocumentOwner();
  try {
    const reply = await circular(owner, true, { mode: "offset", value: 1 });
    assert.equal(reply.error, undefined);
    const body = reply.view.candidate?.bodies?.[0];
    assert.ok(body);
    close(body.volume, ((Math.PI * 10) / 3) * (25 + 30 + 36 - (4 + 2 + 1)));
    await owner.call({ kind: "accept", cleanup: true });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    await owner.call({ kind: "redo" });
    close(owner.view.data.bodies?.[0].volume ?? 0, body.volume);
    const reopened = await owner.call({ kind: "open", document: owner.view.data });
    assert.equal(reopened.error, undefined);
    close(owner.view.data.bodies?.[0].volume ?? 0, body.volume);
  } finally {
    owner.close();
  }
});

test("draft rejects impossible angles and collapsed circles and permits recovery", async () => {
  const owner = new DocumentOwner();
  try {
    for (const draft of [
      { mode: "angle", value: 90 },
      { mode: "offset", value: -6 },
    ] as ExtrusionDraft[]) {
      const reply = await circular(owner, false, draft);
      assert.ok(reply.error, "Invalid draft must not silently generate an inverted solid");
      assert.equal(reply.view.data.bodies?.length ?? 0, 0);
    }
    const recovered = await circular(owner, false, { mode: "offset", value: -1 });
    assert.equal(recovered.error, undefined);
    close(recovered.view.candidate?.bodies?.[0].volume ?? 0, ((Math.PI * 10) / 3) * (25 + 20 + 16));
  } finally {
    owner.close();
  }
});

test("draft supports cubic profile edges with a true end offset", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch: Sketch = {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "arch",
          kind: "bezier",
          a: { x: 0, y: 0 },
          c1: { x: 0, y: 10 },
          c2: { x: 10, y: 10 },
          b: { x: 10, y: 0 },
          construction: false,
        },
        { id: "base", kind: "segment", a: { x: 10, y: 0 }, b: { x: 0, y: 0 }, construction: false },
      ],
    };
    await owner.call({ kind: "edit", sketch });
    for (const distance of [3, -3])
      for (const value of [0.5, -0.5]) {
        const reply = await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            distance,
            mode: "new",
            draft: { mode: "offset", value },
          },
        });
        assert.equal(reply.error, undefined);
        const body = reply.view.candidate?.bodies?.[0];
        assert.ok(body);
        assert.ok((body.volume - 180) * value > 0);
        const end = body.faces.find(
          (f) => f.plane && Math.abs(f.plane.origin[2] - distance) < 1e-6,
        );
        assert.ok(end);
        // The horizontal closing edge moves perpendicular to itself by the offset.
        assert.ok(end.vertices.some((v, i) => i % 3 === 1 && Math.abs(v + value) < 1e-5));
      }
  } finally {
    owner.close();
  }
});

test("draft rejects hole closure and colliding walls", async () => {
  const owner = new DocumentOwner();
  try {
    for (const value of [2, 3, -2]) {
      const reply = await circular(owner, true, { mode: "offset", value });
      assert.ok(reply.error, `Annular draft ${value} must fail before walls vanish`);
      assert.equal(reply.view.data.bodies?.length ?? 0, 0);
    }
  } finally {
    owner.close();
  }
});

test("drafted face extrusion unions onto its source body and shares one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await prism(owner, square);
    const top = original.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
    assert.ok(top);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ face: top.id }],
        distance: 10,
        mode: "auto",
        draft: { mode: "offset", value: 2 },
      },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.booleanMode, "union");
    assert.equal(reply.view.candidate?.bodies?.length, 1);
    close(reply.view.candidate?.bodies?.[0].volume ?? 0, 4000 + (10 * (400 + 480 + 576)) / 3);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.bodies, [original]);
  } finally {
    owner.close();
  }
});
