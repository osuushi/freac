import assert from "node:assert/strict";
import test from "node:test";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { pointHits } from "../src/sketch/picking.js";
import { planes } from "../src/sketch/planes.js";
import { tangentPointPair } from "../src/sketch/point-selection.js";

test("point tangent convenience recognizes only an entire degree-two endpoint junction", () => {
  const first = { ...segment({ x: -10, y: 0 }, { x: 0, y: 0 }), id: "first" };
  const second = { ...segment({ x: 0, y: 0 }, { x: 10, y: 4 }), id: "second" };
  const source = { ...emptySketch(planes.XY), curves: [first, second] };
  const selected = pointHits(source).filter(
    (hit) => hit.kind === "endpoint" && hit.point.x === 0 && hit.point.y === 0,
  );
  assert.deepEqual(
    tangentPointPair(source, selected)?.map((curve) => curve.id),
    [first.id, second.id],
  );
  const third = { ...segment({ x: 0, y: 0 }, { x: 0, y: 10 }), id: "third" };
  const crowded = { ...source, curves: [...source.curves, third] };
  const crowdedSelected = pointHits(crowded).filter(
    (hit) => hit.kind === "endpoint" && hit.point.x === 0 && hit.point.y === 0,
  );
  assert.equal(tangentPointPair(crowded, crowdedSelected), null);

  const cubic = {
    id: "cubic",
    kind: "bezier" as const,
    a: { x: -10, y: 0 },
    c1: { x: -7, y: 2 },
    c2: { x: -3, y: 2 },
    b: { x: 0, y: 0 },
    construction: false,
  };
  const arc = {
    ...bowThrough(segment({ x: 0, y: 0 }, { x: 10, y: 0 }), { x: 5, y: 4 }),
    id: "arc",
  };
  const curved = { ...emptySketch(planes.XY), curves: [cubic, arc] };
  const curvedSelected = pointHits(curved).filter(
    (hit) => hit.kind === "endpoint" && hit.point.x === 0 && hit.point.y === 0,
  );
  assert.deepEqual(
    tangentPointPair(curved, curvedSelected)?.map((curve) => curve.id),
    [cubic.id, arc.id],
  );
});
