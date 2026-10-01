import assert from "node:assert/strict";
import test from "node:test";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle, transform } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { pointKey } from "../src/sketch/point-query.js";
import { SelectedTargets } from "../src/sketch/selected-targets.js";

test("typed points resolve current coordinates in selection order without selecting whole curves", () => {
  const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 6 });
  const rotated = transform(made.sketch, new Set(made.group.members), (p) => ({ x: -p.y, y: p.x }));
  const sketch: Sketch = {
    ...rotated,
    curves: [
      ...rotated.curves,
      {
        id: "cubic",
        kind: "bezier",
        a: { x: 0, y: 0 },
        c1: { x: 3, y: 6 },
        c2: { x: 9, y: 6 },
        b: { x: 12, y: 0 },
        construction: false,
      },
      {
        id: "arc",
        kind: "arc",
        a: { x: 0, y: 0 },
        b: { x: 4, y: 0 },
        bulge: 1,
        construction: false,
      },
    ],
  };
  const selection = new SelectedTargets();
  selection.replace([
    { kind: "group-handle", group: made.group.id, handle: "edge", index: 1 },
    { kind: "curve-center", curve: "arc" },
    { kind: "midpoint", curve: "cubic" },
    { kind: "endpoint", curve: "removed", end: "a" },
  ]);
  const points = selection.pointHits(sketch);
  assert.deepEqual(points.map(pointKey), [
    `${made.group.id}/edge/1`,
    "arc/center",
    "cubic/midpoint",
  ]);
  assert.deepEqual(
    points.map((hit) => hit.point),
    [
      { x: -3, y: 10 },
      { x: 2, y: 0 },
      { x: 6, y: 4.5 },
    ],
  );
  assert.equal(selection.wholeCurves(sketch).size, 0);
  const changed: Sketch = {
    ...sketch,
    curves: sketch.curves.map((curve) =>
      curve.id === "cubic" && curve.kind === "bezier" ? { ...curve, a: { x: 1, y: 0 } } : curve,
    ),
  };
  assert.deepEqual(selection.pointHits(changed).at(-1)?.point, { x: 6.125, y: 4.5 });
  assert.equal(selection.pointHits(undefined).length, 0);
});
