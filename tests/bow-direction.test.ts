import assert from "node:assert/strict";
import test from "node:test";
import { bowRadius } from "../src/sketch/arc-geometry.js";
import { bowDirections } from "../src/sketch/bow-direction.js";
import { emptySketch, type Segment, type Sketch } from "../src/sketch/document.js";
import { jointBow } from "../src/sketch/joint-bow.js";
import { planes } from "../src/sketch/planes.js";

const line = (id: string, ax: number, ay: number, bx: number, by: number): Segment => ({
  id,
  kind: "segment",
  construction: false,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});
function sketch(curves: Segment[]): Sketch {
  return { ...emptySketch(planes.XY), curves };
}
const square = [
  line("bottom", 0, 0, 10, 0),
  line("right", 10, 10, 10, 0),
  line("top", 10, 10, 0, 10),
  line("left", 0, 0, 0, 10),
];

test("parallel precedence matches physical direction despite reversed endpoint order and region sides", () => {
  const s = sketch(square);
  const sources = [square[0], square[2]];
  const directions = bowDirections(s, sources);
  assert.equal(directions?.get("bottom"), 1);
  assert.equal(directions?.get("top"), -1);
  const changed = jointBow(s, sources, bowRadius(sources[0], 12, 1));
  const bottom = changed.curves[0],
    top = changed.curves[2];
  assert.ok(bottom.kind === "arc" && top.kind === "arc");
  assert.ok(bottom.bulge < 0 && top.bulge > 0);
  const collinear = [square[0], line("continuation", 20, 0, 10, 0)];
  assert.equal(bowDirections(sketch(collinear), collinear)?.get("continuation"), -1);
});

test("nonparallel edges match region interior independent of winding and across separate regions", () => {
  const other = [
    line("b2", 20, 0, 30, 0),
    line("r2", 30, 0, 30, 10),
    line("t2", 30, 10, 20, 10),
    line("l2", 20, 10, 20, 0),
  ];
  const s = sketch([...square, ...other]);
  const directions = bowDirections(s, square);
  assert.ok(directions);
  assert.deepEqual([...directions.entries()].slice(0, 4), [
    ["bottom", 1],
    ["right", -1],
    ["top", 1],
    ["left", -1],
  ]);
  const sources = [square[0], other[1]];
  assert.equal(bowDirections(s, sources)?.get("r2"), 1);
  const changed = jointBow(s, square, bowRadius(square[0], 12, -1));
  for (const [i, sign] of [1, -1, 1, -1].entries()) {
    const curve = changed.curves[i];
    assert.ok(curve.kind === "arc");
    assert.equal(Math.sign(curve.bulge), sign, "All four bow outward");
  }
});

test("open, partially bounded, mixed and two-region dividing edges have no multi-bow", () => {
  assert.equal(bowDirections(sketch(square.slice(0, 2)), square.slice(0, 2)), null);
  const divider = line("divider", 0, 0, 10, 10);
  const divided = sketch([...square, divider]);
  assert.equal(bowDirections(divided, [square[0], divider]), null);
  const extended = line("bottom", -5, 0, 10, 0);
  const partial = sketch([extended, ...square.slice(1)]);
  assert.equal(bowDirections(partial, [extended, square[1]]), null);
  assert.equal(bowDirections(sketch(square), [square[0], bowRadius(square[1], 12, 1)]), null);
  assert.throws(
    () => jointBow(divided, [square[0], divider], bowRadius(divider, 12, 1)),
    /no unambiguous/,
  );
});
