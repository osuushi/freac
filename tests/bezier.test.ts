import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bezierAt, bezierParameter, bezierSpan } from "../src/sketch/bezier-geometry.js";
import { curveIntersections } from "../src/sketch/curve-intersections.js";
import { type Bezier, emptySketch, validateSketch } from "../src/sketch/document.js";
import { distance, segment } from "../src/sketch/geometry.js";
import { movePoint, transformSelection } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";
import { trimAt, trimRemainders } from "../src/sketch/trim-geometry.js";

const curve: Bezier = {
  id: "cubic",
  kind: "bezier",
  a: { x: 0, y: 0 },
  c1: { x: 0, y: 10 },
  c2: { x: 10, y: 10 },
  b: { x: 10, y: 0 },
  construction: false,
};
const near = (a: number, b: number, epsilon = 1e-7) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
test("cubic intersections, exact trim and region fill use curve geometry", () => {
  const crossing = segment({ x: 5, y: -5 }, { x: 5, y: 20 });
  const tangent = segment({ x: -5, y: 7.5 }, { x: 15, y: 7.5 });
  assert.equal(curveIntersections(curve, crossing).length, 1);
  assert.equal(curveIntersections(curve, tangent).length, 1);
  near(curveIntersections(curve, tangent)[0].x, 5);
  const other: Bezier = {
    ...curve,
    id: "other",
    a: { x: 5, y: -5 },
    c1: { x: 5, y: 0 },
    c2: { x: 5, y: 10 },
    b: { x: 5, y: 15 },
  };
  assert.equal(curveIntersections(curve, other).length, 1);
  const pieces = trimRemainders(trimAt(curve, [crossing], bezierAt(curve, 0.75)));
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].kind, "bezier");
  near(distance(bezierAt(pieces[0] as Bezier, 0.6), bezierAt(curve, 0.3)), 0);
  for (const t of [0.01, 0.2, 0.7, 0.99]) near(bezierParameter(curve, bezierAt(curve, t)), t);
  const sketch = { ...emptySketch(planes.XY), curves: [curve, segment(curve.b, curve.a)] };
  const profiles = profilesFor(sketch);
  assert.equal(profiles.length, 1);
  near(profiles[0].area, 60);
  assert.ok(profileAt(sketch, { x: 5, y: 3 }));
  assert.equal(profileAt(sketch, { x: 5, y: 9 }), undefined);
  const closed: Bezier = { ...curve, b: curve.a, c1: { x: 10, y: 10 }, c2: { x: -10, y: 10 } };
  const loop = { ...sketch, curves: [closed] };
  validateSketch(loop);
  assert.equal(profilesFor(loop).length, 1);
  assert.equal(curveIntersections(curve, bezierSpan(curve, 0.2, 0.8)).length, 2);
  const reverse = bezierSpan(curve, 1, 0);
  near(distance(bezierAt(reverse, 0.2), bezierAt(curve, 0.8)), 0);
});
test("cubic endpoint handles move and rotate with ordinary selection", () => {
  const sketch = { ...emptySketch(planes.XY), curves: [curve] };
  const moved = movePoint(sketch, { curve: curve.id, end: "a" }, { x: 2, y: 3 })
    .curves[0] as Bezier;
  assert.deepEqual(moved.c1, { x: 2, y: 13 });
  assert.deepEqual(moved.c2, curve.c2);
  const rotated = transformSelection(sketch, new Set([curve.id]), (p) => ({ x: -p.y, y: p.x }))
    .curves[0] as Bezier;
  near(distance(rotated.c1, { x: -10, y: 0 }), 0);
  near(distance(rotated.c2, { x: -10, y: 10 }), 0);
});
test("cubic closed profile extrudes through the native kernel and retains Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = { ...emptySketch(planes.XY), curves: [curve, segment(curve.b, curve.a)] };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 3,
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    near(reply.view.candidate?.bodies?.[0].volume ?? 0, 180, 1e-5);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});

test("self-crossing cubics retain their bounded lobe and collapsed handles retain winding", () => {
  const loop: Bezier = {
    ...curve,
    a: { x: 0, y: 0 },
    c1: { x: 3, y: 3 },
    c2: { x: -1, y: 3 },
    b: { x: 2, y: 0 },
  };
  assert.equal(profilesFor({ ...emptySketch(planes.XY), curves: [loop] }).length, 1);
  const closed: Bezier = { ...curve, c1: curve.a };
  const sketch = { ...emptySketch(planes.XY), curves: [closed, segment(closed.b, closed.a)] };
  assert.equal(profilesFor(sketch).length, 1);
});
