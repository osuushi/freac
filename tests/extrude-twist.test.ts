import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Extrusion } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { square } from "./body-edge-fixtures.js";

const rectangle: Sketch["curves"] = square.map(([x, y], i) => ({
  id: `s${i}`,
  kind: "segment",
  a: { x: x - 10, y: y - 10 },
  b: { x: square[(i + 1) % 4][0] - 10, y: square[(i + 1) % 4][1] - 10 },
  construction: false,
}));
async function setup(owner: DocumentOwner, curves: Sketch["curves"] = rectangle) {
  const sketch: Sketch = { ...emptySketch(planes.XY), curves };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  return {
    sketch: sketch.id,
    profile: profilesFor(sketch).find((p) => p.holes.length)?.key ?? profilesFor(sketch)[0].key,
  };
}
const near = (actual: number, expected: number, relative = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );

test("twisted extrusion preserves volume through signed multiple turns and off-center axes", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(owner);
    for (const [angle, distance, x] of [
      [90, 20, 0],
      [-90, -20, 3],
      [450, 30, 0],
    ]) {
      const started = performance.now();
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [source],
          distance,
          mode: "new",
          twist: { angle, origin: [x, 0, 0] },
        },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      near(body.volume, 400 * Math.abs(distance));
      for (const t of [0.17, 0.39, 0.73]) {
        const z = distance * t,
          section: number[] = [];
        for (const face of body.faces)
          for (let i = 0; i < face.vertices.length; i += 9)
            for (let edge = 0; edge < 3; edge++) {
              const a = i + edge * 3,
                b = i + ((edge + 1) % 3) * 3;
              const az = face.vertices[a + 2],
                bz = face.vertices[b + 2];
              if ((z - az) * (z - bz) > 0 || Math.abs(az - bz) < 1e-10) continue;
              section.push(
                face.vertices[a] + ((face.vertices[b] - face.vertices[a]) * (z - az)) / (bz - az),
              );
            }
        const radians = (angle * t * Math.PI) / 180;
        const center = x * (1 - Math.cos(radians));
        const radius = 10 * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
        assert.ok(Math.abs(Math.min(...section) - (center - radius)) < 0.08);
        assert.ok(Math.abs(Math.max(...section) - (center + radius)) < 0.08);
      }
      assert.equal(reply.view.data.bodies?.length ?? 0, 0);
      console.log(`twist ${angle}: ${Math.round(performance.now() - started)} ms`);
    }
  } finally {
    owner.close();
  }
});

test("twisted draft retains per-wall offset for either length sign and restores through history", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(owner);
    for (const distance of [10, -10]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [source],
          distance,
          mode: "new",
          draft: { mode: "offset", value: 2 },
          twist: { angle: 90, origin: [3, 4, 0] },
        },
      });
      assert.equal(reply.error, undefined);
      near(reply.view.candidate?.bodies?.[0].volume ?? 0, (10 * (400 + 480 + 576)) / 3);
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const document = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, document);
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    assert.ok(document.bodies?.length);
    near(owner.view.data.bodies?.[0].volume ?? 0, document.bodies[0].volume);
  } finally {
    owner.close();
  }
});

test("twist with holes narrows holes under positive draft and rejects collapse and off-plane axes", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(
      owner,
      [5, 2].map((radius, i) => ({
        id: `c${i}`,
        kind: "circle",
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    );
    const extrusion: Extrusion = {
      sources: [source],
      distance: 10,
      mode: "new",
      twist: { angle: 120, origin: [1, 0, 0] },
      draft: { mode: "offset", value: 1 },
    };
    const reply = await owner.call({ kind: "extrude", extrusion });
    assert.equal(reply.error, undefined);
    near(
      reply.view.candidate?.bodies?.[0].volume ?? 0,
      (Math.PI * 10 * (25 + 30 + 36 - 4 - 2 - 1)) / 3,
    );
    for (const change of [
      { draft: { mode: "offset" as const, value: 3 } },
      { twist: { angle: 90, origin: [0, 0, 1] as [number, number, number] } },
    ]) {
      const rejected = await owner.call({
        kind: "extrude",
        extrusion: { ...extrusion, ...change },
      });
      assert.ok(rejected.error);
      assert.equal(rejected.view.data.bodies?.length ?? 0, 0);
      assert.equal(rejected.view.candidate, null);
    }
  } finally {
    owner.close();
  }
});

test("cubic profiles support twist with and without draft", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(owner, [
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
    ]);
    for (const offset of [0, 0.5, -0.5]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [source],
          distance: 10,
          mode: "new",
          draft: { mode: "offset", value: offset },
          twist: { angle: 90, origin: [5, 3, 0] },
        },
      });
      assert.equal(reply.error, undefined);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      if (offset === 0) near(body.volume, 600);
      else assert.ok((body.volume - 600) * offset > 0);
      const cap = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-6);
      assert.ok(cap);
      // The base y=-offset rotates 90° around (5,3) to x=8+offset.
      // This independently checks actual end displacement within the 0.001 mm budget.
      const xs = cap.vertices.filter((_, i) => i % 3 === 0);
      assert.ok(Math.abs(Math.max(...xs) - (8 + offset)) < 0.001);
    }
  } finally {
    owner.close();
  }
});

test("obsolete native twist is cancelled promptly and newest extrusion can use the slot", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(owner);
    const old = owner.call({
      kind: "extrude",
      extrusion: {
        sources: [source],
        distance: 40,
        mode: "new",
        twist: { angle: 1440, origin: [0, 0, 0] },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = performance.now();
    await owner.call({ kind: "supersede-preview", interrupt: true });
    assert.equal((await old).error, "Preview superseded");
    assert.ok(performance.now() - started < 1000, "Supersession must terminate the native process");
    const latest = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [source],
        distance: 10,
        mode: "new",
        twist: { angle: -30, origin: [0, 0, 0] },
      },
    });
    assert.equal(latest.error, undefined);
    near(latest.view.candidate?.bodies?.[0].volume ?? 0, 4000);
    assert.equal(latest.view.data.bodies?.length ?? 0, 0);
    const history = await owner.call({ kind: "read-history" });
    assert.ok(history.history?.some((entry) => entry.outcome === "cancelled"));
  } finally {
    owner.close();
  }
});

test("twisted planar-face extrusion unions and twisted profile subtraction preserves stock", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await setup(owner);
    await owner.call({
      kind: "extrude",
      extrusion: { sources: [source], distance: 10, mode: "new" },
    });
    await owner.call({ kind: "accept" });
    const stock = owner.view.data.bodies?.[0];
    assert.ok(stock);
    const top = stock.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
    assert.ok(top);
    const added = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ face: top.id }],
        distance: 10,
        mode: "union",
        targets: [stock.id],
        twist: { angle: 60, origin: [0, 0, 10] },
      },
    });
    assert.equal(added.error, undefined);
    near(added.view.candidate?.bodies?.[0].volume ?? 0, 8000);
    await owner.call({ kind: "discard" });
    await owner.call({ kind: "new" });
    const circle = await setup(owner, [
      { id: "stock", kind: "circle", center: { x: 0, y: 0 }, radius: 30, construction: false },
    ]);
    await owner.call({
      kind: "extrude",
      extrusion: { sources: [circle], distance: 20, mode: "new" },
    });
    await owner.call({ kind: "accept" });
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const cutSource = await setup(owner);
    const cut = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [cutSource],
        distance: 20,
        mode: "subtract",
        targets: [body.id],
        twist: { angle: 90, origin: [0, 0, 0] },
      },
    });
    assert.equal(cut.error, undefined);
    near(cut.view.candidate?.bodies?.[0].volume ?? 0, Math.PI * 900 * 20 - 8000);
  } finally {
    owner.close();
  }
});
