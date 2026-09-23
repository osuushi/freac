import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { scaleSketch } from "../src/backend/scale-sketch.js";
import { bezierAt } from "../src/sketch/bezier-geometry.js";
import { transformCurveTolerance } from "../src/sketch/circular-beziers.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes, worldPoint } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

const close = (a: number, b: number, tolerance = 1e-5) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const circle = (): Sketch => ({
  ...emptySketch(planes.XY),
  curves: [{ id: "c", kind: "circle", center: { x: 3, y: 4 }, radius: 5, construction: false }],
});
test("anisotropic circle becomes a closed connected cubic ellipse within final-space tolerance", () => {
  const sketch = circle();
  const operation = {
    kind: "curves" as const,
    sketchId: sketch.id,
    ids: ["c"],
    pivot: [0, 0, 0] as [number, number, number],
    factor: 1,
    factors: [3, 0.4, 1] as [number, number, number],
  };
  const result = scaleSketch(sketch, operation);
  assert.ok(result.curves.length > 4);
  assert.equal(result.constraints.length, result.curves.length);
  for (let i = 0; i < result.curves.length; i++) {
    const curve = result.curves[i];
    assert.equal(curve.kind, "bezier");
    if (curve.kind !== "bezier") continue;
    for (let j = 0; j <= 100; j++) {
      const t = j / 100,
        p = bezierAt(curve, t),
        angle = (2 * Math.PI * (i + t)) / result.curves.length;
      assert.ok(
        Math.hypot(p.x - (9 + 15 * Math.cos(angle)), p.y - (1.6 + 2 * Math.sin(angle))) <=
          transformCurveTolerance,
      );
    }
  }
  assert.deepEqual(scaleSketch(sketch, operation), result, "preview identities remain stable");
  const uniform = scaleSketch(sketch, { ...operation, factors: [2, 2, 1] });
  assert.equal(uniform.curves[0].kind, "circle");
  assert.throws(
    () =>
      scaleSketch(
        { ...sketch, constraints: [{ id: "r", kind: "radius", curve: "c", value: 5 }] },
        operation,
      ),
    /radius constraint/,
  );
});
test("converted major arc retains both external endpoint links and construction state", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XZ),
    curves: [
      {
        id: "arc",
        kind: "arc",
        a: { x: 0, y: 0 },
        b: { x: 10, y: 0 },
        bulge: -2,
        construction: true,
      },
      { id: "line", kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, construction: false },
    ],
    constraints: [
      {
        id: "a",
        kind: "coincident",
        a: { curve: "arc", end: "a" },
        b: { curve: "line", end: "a" },
      },
      {
        id: "b",
        kind: "coincident",
        a: { curve: "arc", end: "b" },
        b: { curve: "line", end: "b" },
      },
    ],
  };
  const result = scaleSketch(sketch, {
    kind: "curves",
    sketchId: sketch.id,
    ids: ["arc", "line"],
    pivot: [0, 0, 0],
    factor: 1,
    factors: [2, 0.5, 1],
  });
  const pieces = result.curves.filter((c) => c.kind === "bezier");
  assert.ok(pieces.every((c) => c.construction));
  const last = pieces[pieces.length - 1];
  assert.equal(result.constraints[1].kind, "coincident");
  assert.deepEqual(result.constraints[1], {
    ...sketch.constraints[1],
    a: { curve: last.id, end: "b" },
  });
});
test("world anisotropic scale keeps an oblique whole-sketch frame orthonormal and maps world geometry", () => {
  const s = Math.SQRT1_2;
  const sketch: Sketch = {
    ...emptySketch({ origin: [2, 3, 4], u: [s, s, 0], v: [-0.5, 0.5, s] }),
    curves: [
      { id: "line", kind: "segment", a: { x: 2, y: 5 }, b: { x: 8, y: 3 }, construction: false },
    ],
  };
  const next = scaleSketch(sketch, {
    kind: "sketches",
    ids: [sketch.id],
    pivot: [1, 2, 3],
    factor: 1,
    factors: [2, 3, 4],
  });
  const curve = next.curves[0],
    original = sketch.curves[0];
  if (curve.kind !== "segment" || original.kind !== "segment") throw new Error("line missing");
  for (const end of ["a", "b"] as const) {
    const before = worldPoint(sketch.plane, original[end]),
      after = worldPoint(next.plane, curve[end]);
    after.forEach((x, i) => {
      close(x, i + 1 + (before[i] - i - 1) * (i + 2));
    });
  }
});
test("native whole body anisotropic scaling preserves volume ratio, topology and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      before = owner.view.data;
    const reply = await owner.call({
      kind: "scale",
      operation: {
        kind: "solids",
        ids: [body.id],
        faces: [],
        edges: [],
        pivot: [0, 0, 0],
        factor: 1,
        factors: [2, 3, 4],
      },
    });
    assert.equal(reply.error, undefined);
    const next = reply.view.candidate?.bodies?.[0];
    assert.ok(next);
    close(next.volume, body.volume * 24, 1e-3);
    assert.ok(
      next.faces.every((face) => face.plane),
      "planar faces remain available for subsequent tools",
    );
    assert.deepEqual(next.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
    await owner.call({ kind: "accept" });
    const cap = next.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 40) < 1e-6),
    );
    assert.ok(cap);
    const offset = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: cap.id }], distance: 2 },
    });
    assert.equal(offset.error, undefined, "scaled planar face can be offset again");
    close(offset.view.candidate?.bodies?.[0].volume ?? 0, next.volume + 40 * 60 * 2, 1e-3);
    await owner.call({ kind: "cancel-preview" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
test("scaled cylindrical surface bounds follow extrema instead of spline control points", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, circle());
    const reply = await owner.call({
      kind: "scale",
      operation: {
        kind: "solids",
        ids: [body.id],
        faces: [],
        edges: [],
        pivot: [0, 0, 0],
        factor: 1,
        factors: [1.851423839, 1.514801323, 1.178178808],
      },
    });
    assert.equal(reply.error, undefined);
    const next = reply.view.candidate?.bodies?.[0];
    assert.ok(next);
    const expected = [
      -2 * 1.851423839,
      -1.514801323,
      0,
      8 * 1.851423839,
      9 * 1.514801323,
      10 * 1.178178808,
    ];
    next.bounds.forEach((value, i) => {
      close(value, expected[i]);
    });
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.bodies?.[0], body);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.bodies?.[0].bounds, next.bounds);
  } finally {
    owner.close();
  }
});
for (const round of [false, true])
  test(`native ${round ? "circular" : "rectangular"} cap anisotropic scaling reconnects`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = round ? await lift(owner, circle()) : await prism(owner, square);
      const cap = body.faces.find((f) =>
        f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
      );
      assert.ok(cap);
      const reply = await owner.call({
        kind: "scale",
        operation: {
          kind: "solids",
          ids: [],
          faces: [{ body: body.id, face: cap.id }],
          edges: [],
          pivot: round ? [3, 4, 10] : [10, 10, 10],
          factor: 1,
          factors: [0.5, 0.8, 1],
        },
      });
      assert.equal(reply.error, undefined);
      const next = reply.view.candidate?.bodies?.[0];
      assert.ok(next);
      close(next.volume, body.volume * (1 - 0.7 / 2 + 0.1 / 3), 1e-3);
    } finally {
      owner.close();
    }
  });
