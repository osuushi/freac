import assert from "node:assert/strict";
import test from "node:test";
import { arcCircle, bowRadius } from "../src/sketch/arc-geometry.js";
import type { Arc, Curve } from "../src/sketch/document.js";
import { newId } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { loopArea, orderedLoop, reverseEdge } from "../src/sketch/loop-boundary.js";
import { offsetLoop } from "../src/sketch/loop-offset.js";

const line = (ax: number, ay: number, bx: number, by: number) =>
  segment({ x: ax, y: ay }, { x: bx, y: by });
const offset = (curves: Curve[], amount: number) =>
  offsetLoop(
    orderedLoop(curves),
    amount,
    curves.map(() => newId()),
  );
test("loop offset normalizes drawing order, joins sharp corners and rejects inward collapse", () => {
  const rectangle = [
    line(-10, -5, 10, -5),
    line(10, -5, 10, 5),
    line(10, 5, -10, 5),
    line(-10, 5, -10, -5),
  ];
  for (const curves of [
    rectangle,
    rectangle.map(reverseEdge).reverse(),
    [rectangle[2], rectangle[0], rectangle[3], rectangle[1]],
  ]) {
    const result = offset(curves, 2);
    assert.equal(loopArea(result), 336);
    assert.deepEqual(
      new Set(result.map((c) => `${c.a.x},${c.a.y}`)),
      new Set(["-12,-7", "12,-7", "12,7", "-12,7"]),
    );
    assert.equal(loopArea(offset(curves, -2)), 96);
    assert.throws(() => offset(curves, -5), /collapse|reverse/i);
    assert.throws(() => offset(curves, -8), /collapse|reverse/i);
  }
});
test("mixed arc loop retains true circles and smooth joins in both offset directions", () => {
  const right: Arc = {
    id: newId(),
    kind: "arc",
    construction: false,
    a: { x: 5, y: -3 },
    b: { x: 5, y: 3 },
    bulge: 1,
  };
  const left: Arc = { ...right, id: newId(), a: { x: -5, y: 3 }, b: { x: -5, y: -3 } };
  const capsule = [line(-5, -3, 5, -3), right, line(5, 3, -5, 3), left];
  for (const amount of [2, -1]) {
    const result = offset(capsule, amount);
    for (const c of result)
      if (c.kind === "arc") {
        assert.ok(Math.abs(arcCircle(c).radius - (3 + amount)) < 1e-7);
        assert.ok(Math.abs(Math.abs(arcCircle(c).center.x) - 5) < 1e-7);
        assert.ok(Math.abs(c.bulge - 1) < 1e-7);
      }
    assert.ok(
      Math.abs(loopArea(result) - (20 * (3 + amount) + Math.PI * (3 + amount) ** 2)) < 1e-7,
    );
  }
  assert.throws(() => offset(capsule, -3), /collapse/i);
});
test("concave loop offsets retain their notch and ambiguous/crossed inputs reject", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 10 },
    { x: 0, y: 10 },
  ];
  const loop = points.map((p, i) => segment(p, points[(i + 1) % points.length]));
  const out = offset(loop, 1);
  assert.equal(loopArea(out), 108);
  assert.ok(out.some((c) => c.a.x === 5 && c.a.y === 5));
  assert.equal(loopArea(offset(loop, -1)), 28);
  assert.throws(() => offset(loop, -2), /collapse|reverse/i);
  assert.throws(
    () =>
      offset([line(0, 0, 10, 10), line(10, 10, 0, 10), line(0, 10, 10, 0), line(10, 0, 0, 0)], 1),
    /crossing/i,
  );
  assert.throws(
    () => offset([...loop, line(0, 0, 2, 2), line(2, 2, 0, 0)], 1),
    /unambiguous|crossing/i,
  );
});

test("sharp line/arc and arc/arc corners use the nearest exact support intersection", () => {
  const cap: Arc = {
    id: newId(),
    kind: "arc",
    construction: false,
    a: { x: 4, y: 0 },
    b: { x: -4, y: 0 },
    bulge: 0.5,
  };
  const dome = offset([line(-4, 0, 4, 0), cap], 2);
  for (const c of dome) {
    assert.ok(Math.abs(Math.abs(c.a.x) - Math.sqrt(48)) < 1e-7);
    assert.ok(Math.abs(c.a.y + 2) < 1e-7);
  }
  const arc = dome.find((c): c is Arc => c.kind === "arc");
  assert.ok(arc);
  assert.ok(Math.abs(arcCircle(arc).radius - 7) < 1e-7);
  assert.ok(Math.abs(arcCircle(arc).center.y + 3) < 1e-7);
  const right: Arc = { ...cap, id: newId(), a: { x: 0, y: -4 }, b: { x: 0, y: 4 } };
  const left: Arc = { ...right, id: newId(), a: right.b, b: right.a };
  const lens = offset([right, left], 2);
  for (const c of lens) {
    assert.ok(c.kind === "arc");
    assert.ok(Math.abs(arcCircle(c).radius - 7) < 1e-7);
    assert.ok(Math.abs(c.a.x) < 1e-7);
    assert.ok(Math.abs(Math.abs(c.a.y) - Math.sqrt(40)) < 1e-7);
  }
});

test("concave arc corners preserve their center and reject a distance with no sharp join", () => {
  const arc: Arc = {
    id: newId(),
    kind: "arc",
    construction: false,
    a: { x: 10, y: 10 },
    b: { x: 0, y: 10 },
    bulge: -0.6,
  };
  const loop = [line(0, 0, 10, 0), line(10, 0, 10, 10), arc, line(0, 10, 0, 0)];
  const result = offset(loop, 0.1);
  const current = result.find((c): c is Arc => c.kind === "arc");
  assert.ok(current);
  assert.ok(Math.abs(arcCircle(current).radius - (17 / 3 - 0.1)) < 1e-7);
  assert.ok(Math.abs(arcCircle(current).center.y - 38 / 3) < 1e-7);
  // At +1, the right offset line is x=11, while the offset circle's
  // rightmost point is x=5+(17/3-1), so extending the arc cannot meet it.
  assert.throws(() => offset(loop, 1), /no sharp intersection/);
});

test("offset arc radius editing follows the resulting branch rather than a stale semicircle hint", () => {
  const arc: Arc = {
    id: newId(),
    kind: "arc",
    construction: false,
    a: { x: 4, y: 0 },
    b: { x: -4, y: 0 },
    bulge: 1,
    semicircleBranch: "major",
  };
  const result = offset([line(-4, 0, 4, 0), arc], -1);
  const shortened = result.find((c): c is Arc => c.kind === "arc");
  assert.ok(shortened);
  assert.ok(Math.abs(shortened.bulge) < 1);
  assert.equal(shortened.semicircleBranch, undefined);
  assert.ok(Math.abs(bowRadius(shortened, 4, 1).bulge) < 1);
});
