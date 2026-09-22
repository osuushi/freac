import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Revolution } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

function polygon(points: number[][]): Sketch {
  return {
    ...emptySketch(planes.XZ),
    curves: points.map(([x, y], i) => ({
      id: `edge${i}`,
      kind: "segment",
      construction: false,
      a: { x, y },
      b: { x: points[(i + 1) % points.length][0], y: points[(i + 1) % points.length][1] },
    })),
  };
}
// BRep volume uses numerical integration for the approximated helical surfaces.
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
}
async function sweep(
  owner: DocumentOwner,
  sketch: Sketch,
  angle: number,
  height: number,
  axis: Revolution["axis"] = { origin: [0, 0, 0], direction: [0, 0, 1] },
) {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const profiles = profilesFor(sketch);
  const profile = profiles.find((p) => p.holes.length) ?? profiles[0];
  const before = owner.view.data;
  const reply = await owner.call({
    kind: "revolve",
    revolution: {
      sources: [{ sketch: sketch.id, profile: profile.key }],
      axis,
      angle,
      height,
      mode: "new",
    },
  });
  assert.equal(reply.error, undefined);
  assert.deepEqual(owner.view.data, before, "The sweep stays temporary");
  assert.ok(reply.view.candidate?.bodies?.length);
  return reply.view.candidate.bodies;
}

test("captured axis-touch pentagon closes at 20° and full turns without axial slivers", async () => {
  const owner = new DocumentOwner();
  try {
    // Minimal source geometry from fixture ...02-33-56-489Z-de184123.
    const sketch = polygon([
      [0, 10],
      [10, 10],
      [20, 0],
      [10, -10],
      [0, -10],
    ]);
    for (const angle of [20, 360, -20]) {
      const bodies = await sweep(owner, sketch, angle, 46);
      assert.equal(bodies.length, 1);
      // Integral of radius over this pentagon is 7000/3 mm³.
      near(bodies[0].volume, ((7000 / 3) * Math.abs(angle) * Math.PI) / 180);
    }
  } finally {
    owner.close();
  }
});

test("captured circular helix unions overlapping turns, with Undo and materialized reopen", async () => {
  const owner = new DocumentOwner();
  try {
    // Minimal source geometry from fixture ...02-34-46-530Z-a7ea86f3.
    const sketch: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        { id: "circle", kind: "circle", center: { x: 20, y: 0 }, radius: 7, construction: false },
      ],
    };
    const overlap = 98 * Math.acos(5 / 14) - 2.5 * Math.sqrt(196 - 25);
    const expected = 40 * Math.PI * (98 * Math.PI - overlap);
    for (const [angle, height] of [
      [720, 10],
      [-720, 10],
      [720, -10],
    ]) {
      const bodies = await sweep(owner, sketch, angle, height);
      assert.equal(bodies.length, 1);
      near(bodies[0].volume, expected);
    }
    const before = owner.view.data;
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    near(owner.view.data.bodies?.[0].volume ?? 0, expected);
  } finally {
    owner.close();
  }
});

test("overlapping hollow turns preserve material that fills another turn's cavity", async () => {
  const owner = new DocumentOwner();
  try {
    let sketch = polygon([
      [5, 0],
      [9, 0],
      [9, 4],
      [5, 4],
    ]);
    const hole = polygon([
      [6, 1],
      [8, 1],
      [8, 3],
      [6, 3],
    ]);
    sketch = {
      ...sketch,
      curves: [...sketch.curves, ...hole.curves.map((c) => ({ ...c, id: `hole-${c.id}` }))],
    };
    const bodies = await sweep(owner, sketch, 720, 4);
    assert.equal(bodies.length, 1);
    // At r in [5,6] and [8,9], union axial length is 6; at [6,8] it is 4.
    // Subtracting the swept hole only after union would wrongly erase material.
    near(bodies[0].volume, 280 * Math.PI);
  } finally {
    owner.close();
  }
});

test("axis-crossing line and circular regions sweep both sides and union", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = polygon([
      [-2, 0],
      [3, 0],
      [3, 1],
      [-2, 1],
    ]);
    near((await sweep(owner, sketch, 360, 0))[0].volume, 9 * Math.PI);
    near((await sweep(owner, sketch, 360, 0.5))[0].volume, 10 * Math.PI);
    for (const height of [0, 4, -4]) {
      const bodies = await sweep(owner, sketch, 90, height);
      near(
        bodies.reduce((v, b) => v + b.volume, 0),
        (13 * Math.PI) / 4,
      );
    }
    const circle: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 3, construction: false },
      ],
    };
    near((await sweep(owner, circle, 360, 0))[0].volume, 36 * Math.PI);
    // The two half-disk sweeps overlap with axial separation 2. Integrate
    // r * (2*sqrt(9-r²) + min(2, 2*sqrt(9-r²))) over r and azimuth.
    near((await sweep(owner, circle, 360, 4))[0].volume, (160 / 3) * Math.PI);
    near(
      (await sweep(owner, circle, 360, 12)).reduce((v, b) => v + b.volume, 0),
      72 * Math.PI,
    );
    const c = Math.SQRT1_2;
    const moved = {
      ...sketch,
      plane: { origin: [12, -4, 3], u: [c, c, 0], v: [0, 0, 1] },
    } as Sketch;
    near(
      (await sweep(owner, moved, 90, -4, { origin: [12, -4, 3], direction: [0, 0, 1] })).reduce(
        (v, b) => v + b.volume,
        0,
      ),
      (13 * Math.PI) / 4,
    );
  } finally {
    owner.close();
  }
});

test("tangent circles and eccentric holes preserve their true placement during the screw", async () => {
  const owner = new DocumentOwner();
  try {
    const circle: Sketch = {
      ...emptySketch(planes.XZ),
      curves: [
        { id: "circle", kind: "circle", center: { x: 3, y: 0 }, radius: 3, construction: false },
      ],
    };
    near((await sweep(owner, circle, 180, 8))[0].volume, 27 * Math.PI ** 2);
    const outer = polygon([
      [5, 0],
      [9, 0],
      [9, 6],
      [5, 6],
    ]);
    const hollow: Sketch = {
      ...outer,
      curves: [
        ...outer.curves,
        { id: "hole", kind: "circle", center: { x: 6, y: 2 }, radius: 0.5, construction: false },
      ],
    };
    near((await sweep(owner, hollow, 180, 3))[0].volume, (168 - 1.5 * Math.PI) * Math.PI);
  } finally {
    owner.close();
  }
});
