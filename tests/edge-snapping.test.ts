import assert from "node:assert/strict";
import test from "node:test";
import type { Curve, Segment } from "../src/sketch/document.js";
import { snapToEdge } from "../src/sketch/edge-snapping.js";
import type { Point } from "../src/sketch/planes.js";

const line: Segment = {
  id: "edge",
  kind: "segment",
  construction: false,
  a: { x: 0, y: 0 },
  b: { x: 20, y: 10 },
};
function snap(curve: Curve, x: number, y: number, grid = true) {
  return snapToEdge([curve], { x, y }, 0.6, grid ? { x: Math.round(x), y: Math.round(y) } : null, 1)
    ?.point;
}
function near(actual: Point | undefined, expected: Point) {
  assert.ok(actual && Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-9);
}
test("edge/grid crossings compete with off-edge grid corners", () => {
  near(snap(line, 7.1, 3.58), { x: 7, y: 3.5 });
  near(snap(line, 7.05, 3.96), { x: 7, y: 4 });
  near(snap(line, 7.8, 3.96), { x: 8, y: 4 });
});
test("grid-collinear segments retain ordinary grid snapping", () => {
  for (const x of [2.1, 2.4, 2.6, 7.3]) {
    near(snap({ ...line, b: { x: 20, y: 0 } }, x, 0.1), { x: Math.round(x), y: 0 });
    near(snap({ ...line, b: { x: 0, y: 20 } }, 0.1, x), { x: 0, y: Math.round(x) });
  }
});
test("grid disabled retains continuous edge projection; distant edges do not attract", () => {
  const p = snap(line, 7.1, 3.58, false);
  assert.ok(p && Math.abs(p.y - p.x / 2) < 1e-9);
  assert.ok(p && Math.abs(p.x - 7.112) < 1e-9);
  assert.equal(snap(line, 7, 8), undefined);
});
test("finite edges do not acquire intersections on their extensions", () => {
  near(snap({ ...line, b: { x: 7.7, y: 3.85 } }, 7.9, 4), { x: 8, y: 4 });
});
test("circle, arc and cubic use actual curve/grid intersections", () => {
  const circle: Curve = {
    id: "circle",
    kind: "circle",
    construction: false,
    center: { x: 0, y: 0 },
    radius: 10,
  };
  const arc: Curve = {
    ...line,
    kind: "arc",
    a: { x: 10, y: 0 },
    b: { x: 0, y: 10 },
    bulge: Math.tan(Math.PI / 8),
  };
  const cubic: Curve = {
    ...line,
    kind: "bezier",
    c1: { x: 20 / 3, y: 10 / 3 },
    c2: { x: 40 / 3, y: 20 / 3 },
  };
  for (const curve of [circle, arc]) {
    const p = snap(curve, 6.18, 7.91);
    assert.ok(p && Math.hypot(p.x - 6, p.y - 8) < 1e-7);
  }
  const p = snap(cubic, 7.1, 3.58);
  assert.ok(p && Math.hypot(p.x - 7, p.y - 3.5) < 1e-7);
});
test("translated movement grids retain their origin", () => {
  const result = snapToEdge([line], { x: 7.3, y: 3.6 }, 0.6, { x: 7.25, y: 3.25 }, 1);
  near(result?.point, { x: 7.25, y: 3.625 });
});

test("curved crossings need only one coordinate on the grid", () => {
  const circle: Curve = {
    id: "round",
    kind: "circle",
    construction: false,
    center: { x: 0, y: 0 },
    radius: 5,
  };
  near(snap(circle, 2.1, 4.5), { x: 2, y: Math.sqrt(21) });
  const cubic: Curve = {
    id: "parabola",
    kind: "bezier",
    construction: false,
    a: { x: 0, y: 0 },
    c1: { x: 1 / 3, y: 0 },
    c2: { x: 2 / 3, y: 1 / 3 },
    b: { x: 1, y: 1 },
  };
  near(snapToEdge([cubic], { x: 0.41, y: 0.18 }, 0.1, { x: 0.4, y: 0.2 }, 0.2)?.point, {
    x: 0.4,
    y: 0.16,
  });
});
