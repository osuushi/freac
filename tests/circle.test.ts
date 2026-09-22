import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { appendCircle, circleRadius } from "../src/sketch/circle-edit.js";
import { closestOnCurve, curveBounds, displayPoints } from "../src/sketch/curve-geometry.js";
import { curveIntersections } from "../src/sketch/curve-intersections.js";
import { type Circle, emptySketch, validateSketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { dimensionRectangle, rectangleFrame } from "../src/sketch/rectangle-edit.js";

const circle: Circle = {
  id: "c",
  kind: "circle",
  center: { x: 0, y: 0 },
  radius: 5,
  construction: false,
};
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("analytic circle projection and intersections include tangencies, containment and scale", () => {
  const closest = closestOnCurve(circle, { x: 6, y: 8 });
  near(closest.x, 3);
  near(closest.y, 4);
  assert.deepEqual(curveBounds(circle), [
    { x: -5, y: -5 },
    { x: 5, y: 5 },
  ]);
  const crossed = curveIntersections(segment({ x: -10, y: 3 }, { x: 10, y: 3 }), circle);
  assert.deepEqual(crossed, [
    { x: -4, y: 3 },
    { x: 4, y: 3 },
  ]);
  assert.deepEqual(curveIntersections(segment({ x: -10, y: 5 }, { x: 10, y: 5 }), circle), [
    { x: 0, y: 5 },
  ]);
  assert.deepEqual(curveIntersections(circle, { ...circle, radius: 2 }), []);
  assert.deepEqual(curveIntersections(circle, { ...circle, center: { x: 10, y: 0 } }), [
    { x: 5, y: 0 },
  ]);
  for (const factor of [0.001, 1, 10000]) {
    const a = { ...circle, radius: 5 * factor };
    const points = curveIntersections(a, { ...a, center: { x: 6 * factor, y: 0 } });
    assert.equal(points.length, 2);
    for (const point of points) {
      near(point.x / factor, 3);
      near(Math.abs(point.y / factor), 4);
    }
  }
  const samples = displayPoints(circle, 0.1);
  assert.deepEqual(samples[0], samples.at(-1));
  for (const p of samples) near(Math.hypot(p.x, p.y), 5);
});

test("mixed native rectangle solves preserve interleaved analytic circles and circle Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const made = rectangle(
      appendCircle(emptySketch(planes.XY), { x: -10, y: 3 }, 4).sketch,
      { x: 0, y: 0 },
      { x: 20, y: 10 },
    );
    const target = appendCircle(made.sketch, { x: 30, y: 3 }, 2).sketch;
    const circles = target.curves.filter((curve) => curve.kind === "circle");
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    const resized = dimensionRectangle(target, made.group, "width", 34);
    assert.equal((await owner.call({ kind: "edit", sketch: resized })).error, undefined);
    let accepted = owner.view.data.sketches[0];
    assert.deepEqual(
      accepted.curves.filter((curve) => curve.kind === "circle"),
      circles,
    );
    near(rectangleFrame(accepted, made.group).width, 34);
    const before = structuredClone(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: circleRadius(accepted, circles[0].id, 7) })).error,
      undefined,
    );
    accepted = owner.view.data.sketches[0];
    near(rectangleFrame(accepted, made.group).width, 34);
    assert.equal(accepted.curves.find((curve) => curve.id === circles[0].id)?.kind, "circle");
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    const invalid = { ...target, curves: [{ ...circle, radius: 0 }] };
    assert.throws(() => validateSketch(invalid), /radius/);
    assert.ok((await owner.call({ kind: "edit", sketch: invalid })).error);
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});
