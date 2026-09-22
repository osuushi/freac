import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
async function source(owner: DocumentOwner) {
  const { sketch } = rectangle(emptySketch(planes.XY), { x: -10, y: -6 }, { x: 10, y: 6 });
  await owner.call({ kind: "edit", sketch });
  await owner.call({ kind: "accept" });
  return [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }];
}

test("symmetric extrusion uses signed total depth and preserves source/history", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await source(owner);
    const original = owner.view.data;
    for (const distance of [12, -12]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: { sources, distance, symmetric: true, mode: "new" },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      close(body.bounds[2], -6);
      close(body.bounds[5], 6);
      close(body.volume, 2880);
      assert.deepEqual(reply.view.data, original);
    }
    await owner.call({ kind: "accept" });
    const result = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, result);
    const opened = await owner.call({ kind: "open", document: result });
    assert.equal(opened.error, undefined);
    close(owner.view.data.bodies?.[0].volume ?? 0, 2880);
  } finally {
    owner.close();
  }
});

test("symmetric draft keeps per-cap wall offset and converts angle using half depth", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await source(owner);
    for (const distance of [12, -12])
      for (const offset of [2, -2]) {
        let volume: number | undefined;
        for (const draft of [
          { mode: "offset" as const, value: offset },
          { mode: "angle" as const, value: (Math.atan(offset / 6) * 180) / Math.PI },
        ]) {
          const reply = await owner.call({
            kind: "extrude",
            extrusion: { sources, distance, symmetric: true, mode: "new", draft },
          });
          assert.equal(reply.error, undefined);
          const body = reply.view.candidate?.bodies?.[0];
          assert.ok(body);
          // Integral of (20 + 2ot)(12 + 2ot) over both half-depths.
          close(body.volume, 12 * (240 + 32 * offset + (4 * offset * offset) / 3));
          if (volume !== undefined) close(body.volume, volume);
          volume = body.volume;
          close(body.bounds[2], -6);
          close(body.bounds[5], 6);
        }
      }
    const rejected = await owner.call({
      kind: "extrude",
      extrusion: {
        sources,
        distance: 12,
        symmetric: true,
        mode: "new",
        draft: { mode: "offset", value: -7 },
      },
    });
    assert.ok(rejected.error);
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
  } finally {
    owner.close();
  }
});

test("symmetric twist puts opposite half angles on the caps and supports draft", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await source(owner);
    for (const distance of [12, -12])
      for (const angle of [60, -60]) {
        const reply = await owner.call({
          kind: "extrude",
          extrusion: {
            sources,
            distance,
            symmetric: true,
            mode: "new",
            twist: { angle, origin: [0, 0, 0] },
            draft: { mode: "offset", value: 1 },
          },
        });
        assert.equal(reply.error, undefined);
        const body = reply.view.candidate?.bodies?.[0];
        assert.ok(body);
        close(body.bounds[2], -6);
        close(body.bounds[5], 6);
        for (const side of [-1, 1]) {
          const cap = body.faces.find(
            (f) => f.plane && Math.abs(f.plane.origin[2] - (side * distance) / 2) < 1e-6,
          );
          assert.ok(cap);
          const a = (side * angle * Math.PI) / 360;
          const expected = [11 * Math.cos(a) - 7 * Math.sin(a), 11 * Math.sin(a) + 7 * Math.cos(a)];
          assert.ok(
            Array.from({ length: cap.vertices.length / 3 }, (_, i) =>
              cap.vertices.slice(i * 3, i * 3 + 3),
            ).some((v) => Math.hypot(v[0] - expected[0], v[1] - expected[1]) < 1e-5),
          );
        }
      }
  } finally {
    owner.close();
  }
});

test("centered extrusion participates in booleans and leaves editable caps", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = await source(owner);
    await owner.call({
      kind: "extrude",
      extrusion: { sources, distance: 12, symmetric: true, mode: "new" },
    });
    await owner.call({ kind: "accept" });
    const original = owner.view.data.bodies?.[0];
    assert.ok(original);
    const top = original.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 6) < 1e-6);
    assert.ok(top);
    const edited = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: original.id, face: top.id }], distance: 2 },
    });
    assert.equal(edited.error, undefined);
    close(edited.view.candidate?.bodies?.[0].volume ?? 0, 3360);
    await owner.call({ kind: "discard" });
    for (const [mode, distance, expected] of [
      ["union", 16, 3840],
      ["subtract", 4, 1920],
      ["intersect", 4, 960],
    ] as const) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: { sources, distance, symmetric: true, mode, targets: [original.id] },
      });
      assert.equal(reply.error, undefined);
      close(reply.view.candidate?.bodies?.reduce((sum, b) => sum + b.volume, 0) ?? 0, expected);
      assert.equal(owner.view.data.bodies?.[0].brep, original.brep);
    }
  } finally {
    owner.close();
  }
});

test("symmetric sweep preserves holes and accepts cubic twist with draft", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = {
      ...emptySketch(planes.XY),
      curves: [5, 2].map((radius, i) => ({
        id: `circle${i}`,
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    };
    await owner.call({ kind: "edit", sketch });
    await owner.call({ kind: "accept" });
    const profile = profilesFor(sketch).find((p) => p.holes.length === 1);
    assert.ok(profile);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profile.key }],
        distance: 10,
        symmetric: true,
        draft: { mode: "offset", value: 1 },
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    close(reply.view.candidate?.bodies?.[0].volume ?? 0, Math.PI * 280);
    await owner.call({ kind: "discard" });
    const cubic = {
      ...emptySketch(planes.XY),
      curves: [
        {
          id: "arch",
          kind: "bezier" as const,
          a: { x: 0, y: 0 },
          c1: { x: 0, y: 10 },
          c2: { x: 10, y: 10 },
          b: { x: 10, y: 0 },
          construction: false,
        },
        {
          id: "base",
          kind: "segment" as const,
          a: { x: 10, y: 0 },
          b: { x: 0, y: 0 },
          construction: false,
        },
      ],
    };
    await owner.call({ kind: "edit", sketch: cubic });
    await owner.call({ kind: "accept" });
    const twisted = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: cubic.id, profile: profilesFor(cubic)[0].key }],
        distance: 10,
        symmetric: true,
        draft: { mode: "offset", value: 0.5 },
        twist: { angle: 90, origin: [5, 3, 0] },
        mode: "new",
      },
    });
    assert.equal(twisted.error, undefined);
    const body = twisted.view.candidate?.bodies?.[0];
    assert.ok(body);
    close(body.bounds[2], -5);
    close(body.bounds[5], 5);
    assert.ok(body.volume > 600);
  } finally {
    owner.close();
  }
});
