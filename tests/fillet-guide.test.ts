import assert from "node:assert/strict";
import test from "node:test";
import type { Arc, Segment } from "../src/sketch/document.js";
import { filletCorner, filletShape } from "../src/sketch/fillet-geometry.js";
import { filletGuideShape } from "../src/sketch/fillet-guide-shape.js";

test("a shallow line/arc loop gets a feasible guide without changing explicit radii", () => {
  const arc: Arc = {
    id: "arc",
    kind: "arc",
    a: { x: -4, y: 0 },
    b: { x: 4, y: 0 },
    bulge: -0.5,
    construction: false,
  };
  const line: Segment = { id: "line", kind: "segment", a: arc.b, b: arc.a, construction: false };
  const corner = filletCorner(arc, line, "a", "b");
  const desired = (16 * 80) / 850 / (1 / Math.sin(corner.half) - 1);
  assert.throws(() => filletShape(corner, desired, "guide"), /No rounding arc fits/);
  const result = filletGuideShape(corner, desired);
  assert.ok(result && result.radius < desired);
  assert.deepEqual(result.shape, filletShape(corner, result.radius, "fillet-guide"));
  assert.equal(filletGuideShape(corner, desired, true), null);
  const valid = filletGuideShape(corner, 0.5);
  assert.equal(valid?.radius, 0.5, "Already feasible hints retain their size and hit placement");
});
