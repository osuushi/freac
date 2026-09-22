import assert from "node:assert/strict";
import test from "node:test";
import { boundaryPoints, spanArea } from "../src/sketch/curve-spans.js";
import type { Circle, Curve } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { closedBoundaries, signedArea } from "../src/sketch/regions.js";

const circle: Circle = {
  id: "circle",
  kind: "circle",
  center: { x: 0, y: 0 },
  radius: 10,
  construction: false,
};
const line = (ax: number, ay: number, bx: number, by: number) =>
  segment({ x: ax, y: ay }, { x: bx, y: by });
const areas = (curves: Curve[]) =>
  closedBoundaries(curves)
    .map((b) => b.reduce((sum, span) => sum + spanArea(span), 0))
    .sort((a, b) => a - b);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("circle and exterior line chain make an arc-bounded face independent of sampling and seam", () => {
  for (const angle of [0, 0.31, 2.4, -1.2]) {
    const point = (x: number, y: number) => ({
      x: 30 + x * Math.cos(angle) - y * Math.sin(angle),
      y: -20 + x * Math.sin(angle) + y * Math.cos(angle),
    });
    const curves: Curve[] = [
      { ...circle, center: point(0, 0) },
      segment(point(0, 10), point(16, 16)),
      segment(point(16, 16), point(10, 0)),
    ];
    const before = structuredClone(curves);
    const boundaries = closedBoundaries(curves);
    const actual = areas(curves);
    assert.equal(actual.length, 2);
    near(actual[0], 160 - 25 * Math.PI);
    near(actual[1], 100 * Math.PI);
    const wedge = boundaries.find((b) => b.some((s) => s.curve.kind === "segment"));
    assert.ok(
      wedge?.some(
        (s) => s.curve.kind === "circle" && Math.abs(s.end - s.start) <= Math.PI / 2 + 1e-10,
      ),
    );
    for (const scale of [2, 0.1, 0.001]) {
      assert.equal(boundaries.map((b) => boundaryPoints(b, scale)).length, 2);
      for (const boundary of boundaries) assert.ok(signedArea(boundaryPoints(boundary, scale)) > 0);
    }
    assert.deepEqual(curves, before);
    const reversed = curves
      .map((c) => (c.kind === "segment" ? { ...c, a: c.b, b: c.a } : c))
      .reverse();
    const reversedAreas = areas(reversed);
    assert.equal(reversedAreas.length, 2);
    reversedAreas.forEach((value, i) => {
      near(value, actual[i]);
    });
  }
});

test("true gaps and construction lines don't close an exterior wedge", () => {
  const edges = [line(0, 10, 16, 16), line(16, 16, 10, 0)];
  assert.equal(areas([circle, ...edges]).length, 2);
  for (const curves of [
    [circle, edges[0]],
    [circle, line(0, 10.001, 16, 16), edges[1]],
    [circle, { ...edges[0], construction: true }, edges[1]],
  ]) {
    const found = areas(curves);
    assert.equal(found.length, 1);
    near(found[0], 100 * Math.PI);
  }
});

test("circle crossings, tangencies, duplicate arcs and line tails preserve bounded faces", () => {
  let found = areas([circle, line(-20, 0, 20, 0)]);
  assert.equal(found.length, 2);
  found.forEach((area) => {
    near(area, 50 * Math.PI);
  });
  found = areas([circle, line(-20, 10, 20, 10)]);
  assert.equal(found.length, 1);
  near(found[0], 100 * Math.PI);
  found = areas([circle, { ...circle, id: "copy" }]);
  assert.equal(found.length, 1);
  near(found[0], 100 * Math.PI);
  found = areas([circle, { ...circle, id: "tangent", center: { x: 20, y: 0 } }]);
  assert.equal(found.length, 2);
  found.forEach((area) => {
    near(area, 100 * Math.PI);
  });
  found = areas([circle, { ...circle, id: "inside", center: { x: 5, y: 0 }, radius: 5 }]);
  assert.equal(found.length, 2);
  near(found[0], 25 * Math.PI);
  near(found[1], 75 * Math.PI);
  found = areas([circle, { ...circle, id: "crossing", center: { x: 10, y: 0 } }]);
  assert.equal(found.length, 3);
  const lens = (200 * Math.PI) / 3 - 50 * Math.sqrt(3);
  near(found[0], lens);
  near(found[1], 100 * Math.PI - lens);
  near(found[2], 100 * Math.PI - lens);
});
