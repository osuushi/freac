import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowThrough } from "../src/sketch/arc-geometry.js";
import { emptySketch, newId, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { offsetCurve } from "../src/sketch/offset-geometry.js";
import { planes } from "../src/sketch/planes.js";

test("edge offset keeps signed normal distance and arc domain, and rejects collapse", () => {
  const line = segment({ x: 0, y: 0 }, { x: 3, y: 4 });
  const copy = offsetCurve(line, 2, newId());
  assert.ok(copy.kind === "segment");
  assert.deepEqual(copy.a, { x: -1.6, y: 1.2 });
  assert.deepEqual(copy.b, { x: 1.4, y: 5.2 });
  for (const height of [2, 8, -2, -8]) {
    const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: height });
    assert.ok(arc.kind === "arc");
    const circle = arcCircle(arc),
      outside = offsetCurve(arc, 2, newId());
    assert.ok(outside.kind === "arc");
    assert.equal(outside.bulge, arc.bulge);
    assert.ok(Math.abs(arcCircle(outside).radius - 7) < 1e-7);
    assert.ok(Math.abs(arcCircle(outside).center.y - circle.center.y) < 1e-7);
    assert.ok(Math.abs(outside.a.x + 5.6) < 1e-7);
    assert.ok(Math.abs(outside.b.x - 5.6) < 1e-7);
    assert.throws(() => offsetCurve(arc, -5, newId()), /collapse/);
    assert.throws(() => offsetCurve(arc, 0, newId()), /non-zero/);
  }
});

test("native offset preview and Undo preserve constrained source without relating the copy", async () => {
  const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 8 });
  assert.ok(arc.kind === "arc");
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [arc],
    constraints: [{ id: newId(), kind: "radius", curve: arc.id, value: 5 }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    const changed = { ...original, curves: [arc, offsetCurve(arc, -2, newId())] };
    assert.equal((await owner.call({ kind: "preview", sketch: changed })).error, undefined);
    assert.deepEqual(owner.view.data.sketches[0], original);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.deepEqual(owner.view.data.sketches[0].constraints, original.constraints);
    assert.deepEqual(owner.view.data.sketches[0].curves[0], arc);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data.sketches[0].curves.length, 2);
  } finally {
    owner.close();
  }
});
