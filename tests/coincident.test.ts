import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowThrough } from "../src/sketch/arc-geometry.js";
import { type Arc, emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { makeCoincident } from "../src/sketch/point-links.js";

test("coincidence moves the first chosen point and preserves the reference curve", async () => {
  const reference = segment({ x: 3, y: 5 }, { x: 8, y: 5 });
  const subject = segment({ x: -10, y: 0 }, { x: -5, y: 0 });
  const sketch = { ...emptySketch(planes.XY), curves: [reference, subject] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const target = makeCoincident(sketch, [
      { curve: subject.id, end: "b" },
      { curve: reference.id, end: "a" },
    ]);
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: target,
          intent: {
            kind: "pair",
            subject: subject.id,
            reference: reference.id,
            targets: [{ curve: subject.id, end: "b" }],
          },
        })
      ).error,
      undefined,
    );
    const result = owner.view.data.sketches[0];
    assert.deepEqual(result.curves[0], reference);
    assert.deepEqual(result.curves[1], { ...subject, b: reference.a });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});

test("coincidence can move a radius-locked arc endpoint to a circle center", async () => {
  const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 4 }) as Arc;
  const circle = {
    id: "reference",
    kind: "circle" as const,
    center: { x: -3, y: 1 },
    radius: 2,
    construction: false,
  };
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [circle, arc],
    constraints: [{ id: "radius", kind: "radius" as const, curve: arc.id, value: 4 }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const target = makeCoincident(sketch, [
      { curve: arc.id, end: "a" },
      { curve: circle.id, end: "center" },
    ]);
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: target,
          intent: {
            kind: "pair",
            subject: arc.id,
            reference: circle.id,
            targets: [{ curve: arc.id, end: "a" }],
          },
        })
      ).error,
      undefined,
    );
    const result = owner.view.data.sketches[0];
    assert.deepEqual(result.curves[0], circle);
    const solved = result.curves[1] as Arc;
    assert.deepEqual(solved.a, circle.center);
    assert.deepEqual(solved.b, arc.b);
    assert.ok(Math.abs(arcCircle(solved).radius - 4) < 1e-7);
  } finally {
    owner.close();
  }
});
