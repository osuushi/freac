import assert from "node:assert/strict";
import test from "node:test";
import { bezierAt, bezierSpan } from "../src/sketch/bezier-geometry.js";
import { type Bezier, type Circle, emptySketch, newId } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";
import { trimBrushSpans, trimHighlights } from "../src/sketch/trim-brush.js";
import { trimOverlappingSketch } from "../src/sketch/trim-edit.js";
import { spanCurve, trimAt } from "../src/sketch/trim-geometry.js";

const line = (ax: number, ay: number, bx: number, by: number) =>
  segment({ x: ax, y: ay }, { x: bx, y: by });

test("brush tests finite spans, including multiple targets and contact at its boundary", () => {
  const source = line(-10, 0, 10, 0),
    parallel = line(-10, 1, 10, 1),
    cutters = [line(-4, -8, -4, 8), line(4, -8, 4, 8)],
    curves = [source, parallel, ...cutters];
  const p = { x: 0, y: 0.5 };
  const spans = trimBrushSpans(curves, p, p, 0.5);
  assert.deepEqual(
    spans.map((s) => s.curve.id),
    [source.id, parallel.id],
  );
  for (const span of spans) {
    const c = spanCurve(span);
    assert.equal(c.kind, "segment");
    if (c.kind === "segment") {
      assert.equal(c.a.x, -4);
      assert.equal(c.b.x, 4);
    }
  }
});

test("sweep catches crossings between sparse pointer samples without using infinite supports", () => {
  const crossing = line(0, -4, 0, 4),
    short = line(3, -0.1, 3, 0.1),
    beyond = line(20, -4, 20, 4),
    away = line(-2, 2, 2, 2);
  const spans = trimBrushSpans(
    [crossing, short, beyond, away],
    { x: -10, y: 0 },
    { x: 10, y: 0 },
    0.2,
  );
  assert.deepEqual(
    spans.map((s) => s.curve.id),
    [crossing.id, short.id],
  );
});

test("circle, finite arc and cubic brush contacts use their actual geometry", () => {
  const circle: Circle = {
    id: newId(),
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    construction: false,
  };
  const arc = spanCurve({ curve: circle, start: 0, end: 0.25 }, newId());
  const cubic: Bezier = {
    id: newId(),
    kind: "bezier",
    a: { x: -10, y: -10 },
    c1: { x: -5, y: 10 },
    c2: { x: 5, y: -10 },
    b: { x: 10, y: 10 },
    construction: false,
  };
  const p = { x: 0, y: -5 };
  assert.deepEqual(
    trimBrushSpans([circle, arc], p, p, 0.2).map((s) => s.curve.id),
    [circle.id],
  );
  const midpoint = bezierAt(cubic, 0.5);
  assert.equal(trimBrushSpans([cubic], midpoint, midpoint, 0.01).length, 1);
  assert.equal(trimBrushSpans([circle], { x: -10, y: 0 }, { x: 10, y: 0 }, 0.1).length, 1);
  assert.equal(
    trimBrushSpans([{ ...circle, radius: 0.05 }], { x: -10, y: 0 }, { x: 10, y: 0 }, 0.1).length,
    1,
  );
  assert.equal(
    trimBrushSpans([{ ...circle, radius: 50 }], { x: -10, y: 0 }, { x: 10, y: 0 }, 0.1).length,
    0,
  );
  assert.equal(trimBrushSpans([cubic], { x: -10, y: 0 }, { x: 10, y: 0 }, 0.1).length, 1);
});

test("Shift brush follows degree-two joins and highlights coincident removal beyond its disk", () => {
  const a = line(-10, 0, 0, 0),
    b = line(0, 0, 10, 0),
    overlap = line(-10, 0, -5, 0);
  const p = { x: -7, y: 0 };
  assert.equal(trimBrushSpans([a, b], p, p, 0.1, true).length, 2);
  const span = trimAt(a, [a, b], p);
  const highlights = trimHighlights([span], [a, b, overlap]);
  assert.deepEqual(
    highlights.map((s) => s.curve.id),
    [a.id, overlap.id],
  );
});

test("batch trim removes disjoint spans of one line and duplicates without resurrecting remnants", () => {
  const source = line(-10, 0, 10, 0),
    duplicate = line(10, 0, -10, 0);
  const cutters = [-6, -2, 2, 6].map((x) => line(x, -5, x, 5));
  const original = { ...emptySketch(planes.XY), curves: [source, duplicate, ...cutters] };
  const spans = [-4, 4].map((x) => trimAt(source, original.curves, { x, y: 0 }));
  for (const targets of [spans, [...spans].reverse(), [...spans, ...spans]]) {
    const result = trimOverlappingSketch(original, targets).sketch;
    validateSketch(result);
    const remnants = result.curves.filter(
      (c) => c.kind === "segment" && c.a.y === 0 && c.b.y === 0,
    );
    assert.equal(remnants.length, 6);
    for (const c of remnants) {
      assert.ok(c.kind === "segment");
      assert.ok(
        Math.max(c.a.x, c.b.x) <= -6 ||
          Math.min(c.a.x, c.b.x) >= 6 ||
          (Math.min(c.a.x, c.b.x) >= -2 && Math.max(c.a.x, c.b.x) <= 2),
      );
    }
    assert.deepEqual(
      result.curves.filter((c) => cutters.some((v) => v.id === c.id)),
      cutters,
    );
  }
});

test("batch circular trim resolves subsequent spans on the surviving arc across the seam", () => {
  const circle: Circle = {
    id: newId(),
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    construction: false,
  };
  const curves = [circle, line(-8, 0, 8, 0), line(0, -8, 0, 8)];
  const original = { ...emptySketch(planes.XY), curves };
  const spans = [trimAt(circle, curves, { x: 3, y: 3 }), trimAt(circle, curves, { x: -3, y: -3 })];
  for (const targets of [spans, [...spans].reverse()]) {
    const result = trimOverlappingSketch(original, targets).sketch;
    validateSketch(result);
    const arcs = result.curves.filter((c) => c.kind === "arc");
    assert.equal(arcs.length, 2);
    for (const arc of arcs) {
      assert.ok(Math.abs(4 * Math.atan(arc.bulge) - Math.PI / 2) < 1e-7);
      assert.ok(arc.a.x * arc.a.y <= 1e-7 && arc.b.x * arc.b.y <= 1e-7);
    }
  }
});

test("batch cubic trim removes disjoint spans and retains the original finite remnant shapes", () => {
  const curve: Bezier = {
    id: newId(),
    kind: "bezier",
    construction: false,
    a: { x: -10, y: 0 },
    c1: { x: -5, y: 8 },
    c2: { x: 5, y: -8 },
    b: { x: 10, y: 0 },
  };
  const cuts = [0.2, 0.4, 0.6, 0.8].map((t) => {
    const p = bezierAt(curve, t);
    return line(p.x, -10, p.x, 10);
  });
  const original = { ...emptySketch(planes.XY), curves: [curve, ...cuts] };
  const spans = [0.3, 0.7].map((t) => trimAt(curve, original.curves, bezierAt(curve, t)));
  for (const targets of [spans, [...spans].reverse()]) {
    const result = trimOverlappingSketch(original, targets).sketch;
    validateSketch(result);
    const pieces = result.curves.filter((c) => c.kind === "bezier");
    assert.equal(pieces.length, 3);
    for (const [i, range] of [
      [0, 0.2],
      [0.4, 0.6],
      [0.8, 1],
    ].entries()) {
      const expected = bezierSpan(curve, range[0], range[1]);
      for (const key of ["a", "c1", "c2", "b"] as const) {
        assert.ok(
          Math.hypot(pieces[i][key].x - expected[key].x, pieces[i][key].y - expected[key].y) < 1e-7,
        );
      }
    }
  }
});
