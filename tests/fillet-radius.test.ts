import assert from "node:assert/strict";
import test from "node:test";
import { arcAt, bowRadius } from "../src/sketch/arc-geometry.js";
import { curveDistance } from "../src/sketch/curve-geometry.js";
import { filletCorner, filletShape } from "../src/sketch/fillet-geometry.js";
import { filletRadiusAt } from "../src/sketch/fillet-radius.js";
import { segment } from "../src/sketch/geometry.js";

for (const angle of [8, 45, 90, 165, -90]) {
  test(`drag follows the entire ${angle} degree fillet, including off-bisector points`, () => {
    const radians = (angle * Math.PI) / 180;
    const corner = filletCorner(
      segment({ x: 0, y: 0 }, { x: 20, y: 0 }),
      segment({ x: 0, y: 0 }, { x: 20 * Math.cos(radians), y: 20 * Math.sin(radians) }),
      "a",
      "a",
    );
    const radius = corner.limit * 0.4;
    for (const fraction of [0, 0.05, 0.25, 0.5, 0.9, 1]) {
      const point = arcAt(filletShape(corner, radius, "expected"), fraction);
      const chosen = filletRadiusAt(corner, point);
      assert.ok(Math.abs(chosen - radius) < 1e-5, `${fraction}: ${chosen} != ${radius}`);
    }
    const point = { x: 7, y: -3 };
    const chosen = filletRadiusAt(corner, point);
    const error =
      chosen > 1e-7
        ? curveDistance(filletShape(corner, chosen, "actual"), point)
        : Math.hypot(point.x, point.y);
    for (let r = corner.limit / 100; r < corner.limit * 3; r += corner.limit / 100) {
      assert.ok(error <= curveDistance(filletShape(corner, r, "reference"), point) + 1e-6);
    }
  });
}

test("curved and consumed support dragging minimizes distance to the resulting arc", () => {
  for (const curved of [false, true]) {
    const line = segment({ x: 0, y: 0 }, { x: 20, y: 0 });
    const a = curved ? bowRadius(line, 30, 1) : line;
    const b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
    const corner = filletCorner(a, b, "a", "a");
    for (const radius of [2, 15, 40]) {
      const arc = filletShape(corner, radius, "expected");
      for (const fraction of [0.1, 0.4, 0.8]) {
        const point = arcAt(arc, fraction);
        const chosen = filletRadiusAt(corner, point);
        assert.ok(curveDistance(filletShape(corner, chosen, "chosen"), point) < 1e-5);
      }
    }
  }
});

test("grid radius snapping compares arc distance, and a cursor behind the corner requests collapse", () => {
  const corner = filletCorner(
    segment({ x: 0, y: 0 }, { x: 20, y: 0 }),
    segment({ x: 0, y: 0 }, { x: 0, y: 20 }),
    "a",
    "a",
  );
  assert.equal(filletRadiusAt(corner, { x: 2, y: 1 }, 1), 5);
  assert.equal(filletRadiusAt(corner, { x: -2, y: -1 }), 0);
});
