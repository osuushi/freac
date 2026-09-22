import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bezierSpan } from "../src/sketch/bezier-geometry.js";
import {
  type Bezier,
  type Circle,
  emptySketch,
  newId,
  validateSketch,
} from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { trimOverlappingSketch } from "../src/sketch/trim-edit.js";
import { spanCurve, trimAt } from "../src/sketch/trim-geometry.js";

const line = (a: number, b: number, y = 0) => segment({ x: a, y }, { x: b, y });

test("overlap trim clears duplicates and reversed longer edges, preserves crossing/nearby curves, one Undo", async () => {
  const source = line(-2, 2),
    long = line(10, -10),
    duplicate = line(-2, 2);
  const crossing = segment({ x: 0, y: -5 }, { x: 0, y: 5 }),
    near = line(-5, 5, 0.001);
  const original = { ...emptySketch(planes.XY), curves: [source, long, duplicate, crossing, near] };
  const result = trimOverlappingSketch(
    original,
    trimAt(source, original.curves, { x: 1, y: 0 }),
  ).sketch;
  validateSketch(result);
  assert.deepEqual(
    result.curves.find((c) => c.id === crossing.id),
    crossing,
  );
  assert.deepEqual(
    result.curves.find((c) => c.id === near.id),
    near,
  );
  const horizontal = result.curves.filter(
    (c) => c.kind === "segment" && c.a.y === 0 && c.b.y === 0,
  );
  assert.equal(horizontal.length, 4);
  for (const c of horizontal) {
    assert.ok(c.kind === "segment");
    assert.ok(Math.max(c.a.x, c.b.x) <= 0 || Math.min(c.a.x, c.b.x) >= 2);
  }
  const other = { ...emptySketch(planes.XZ), curves: [line(-2, 2)] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: other })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "edit", sketch: result })).error, undefined);
    assert.deepEqual(
      owner.view.data.sketches.find((s) => s.id === other.id),
      other,
    );
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});

test("circular overlap clears across the periodic seam and leaves complementary arcs", () => {
  const circle: Circle = {
    id: newId(),
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    construction: false,
  };
  const arc = spanCurve({ curve: circle, start: 0.9, end: 1.1 }, newId());
  const duplicate = { ...circle, id: newId() };
  const sketch = { ...emptySketch(planes.XY), curves: [arc, circle, duplicate] };
  const result = trimOverlappingSketch(sketch, { curve: arc, start: 0, end: 1 }).sketch;
  assert.equal(result.curves.length, 2);
  for (const curve of result.curves) {
    assert.equal(curve.kind, "arc");
    if (curve.kind !== "arc" || arc.kind !== "arc") continue;
    assert.ok(Math.hypot(curve.a.x - arc.b.x, curve.a.y - arc.b.y) < 1e-7);
    assert.ok(Math.hypot(curve.b.x - arc.a.x, curve.b.y - arc.a.y) < 1e-7);
  }
  const full = { ...sketch, curves: [circle, duplicate] };
  assert.equal(
    trimOverlappingSketch(full, { curve: circle, start: 0, end: 1 }).sketch.curves.length,
    0,
  );
});

test("cubic overlap clears reversed subcurves without touching a crossing cubic", () => {
  const cubic: Bezier = {
    id: newId(),
    kind: "bezier",
    a: { x: -10, y: 0 },
    c1: { x: -5, y: 10 },
    c2: { x: 5, y: -10 },
    b: { x: 10, y: 0 },
    construction: false,
  };
  const short = { ...bezierSpan(cubic, 0.25, 0.75), id: newId() };
  const reversed = { ...bezierSpan(cubic, 1, 0), id: newId() };
  const crossing = { ...cubic, id: newId(), c1: { x: -5, y: -10 }, c2: { x: 5, y: 10 } };
  const sketch = { ...emptySketch(planes.XY), curves: [short, cubic, reversed, crossing] };
  const result = trimOverlappingSketch(sketch, { curve: short, start: 0, end: 1 }).sketch;
  assert.equal(result.curves.length, 5);
  assert.deepEqual(
    result.curves.find((c) => c.id === crossing.id),
    crossing,
  );
  validateSketch(result);
});

test("straight cubic and analytic line overlap clear in either targeting order", () => {
  const source = line(-6, 6);
  const cubic: Bezier = {
    ...source,
    kind: "bezier",
    id: newId(),
    c1: { x: -2, y: 0 },
    c2: { x: 2, y: 0 },
  };
  const sketch = { ...emptySketch(planes.XY), curves: [source, cubic] };
  for (const curve of sketch.curves) {
    assert.equal(
      trimOverlappingSketch(sketch, { curve, start: 0, end: 1 }).sketch.curves.length,
      0,
    );
  }
});
