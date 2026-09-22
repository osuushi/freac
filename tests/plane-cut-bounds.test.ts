import assert from "node:assert/strict";
import test from "node:test";
import { planeCrossesBounds } from "../src/model/plane-cut-bounds.js";
import { planes } from "../src/sketch/planes.js";

test("cut references use infinite support and exclude disjoint or tangent boxes", () => {
  const box = [-10, -10, 0, 10, 10, 20];
  assert.equal(planeCrossesBounds(planes.XY, box), false);
  assert.equal(planeCrossesBounds(planes.YZ, box), true);
  for (const z of [-10, 20, 30])
    assert.equal(planeCrossesBounds({ ...planes.XY, origin: [0, 0, z] }, box), false);
  assert.equal(planeCrossesBounds({ ...planes.XY, origin: [1000, 1000, 10] }, box), true);
  const s = Math.SQRT1_2;
  const oblique = {
    origin: [0, 0, 10] as [number, number, number],
    u: [s, 0, -s] as [number, number, number],
    v: planes.XY.v,
  };
  assert.equal(planeCrossesBounds(oblique, box), true);
  assert.equal(planeCrossesBounds({ ...oblique, origin: [30, 0, 30] }, box), false);
  assert.equal(planeCrossesBounds({ ...oblique, u: [-s, 0, s] }, box), true);
});
