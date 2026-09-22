import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowRadius } from "../src/sketch/arc-geometry.js";
import { emptySketch, validateSketch } from "../src/sketch/document.js";
import { createFillet, editFilletRadius, existingFillet } from "../src/sketch/fillet-edit.js";
import { filletCorner } from "../src/sketch/fillet-geometry.js";
import { distance, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";

test("rounding consumes unequal straight supports without moving either far endpoint", () => {
  const a = segment({ x: 0, y: 0 }, { x: 20, y: 0 }),
    b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
  const sketch = { ...emptySketch(planes.XY), curves: [a, b] };
  const corner = filletCorner(a, b, "a", "a");
  for (const radius of [10, 10.001, 15, 24.999, 25, 40, 100]) {
    const result = createFillet(sketch, corner, radius);
    validateSketch(result.sketch);
    assert.ok(Math.abs(arcCircle(result.arc).radius - radius) < 1e-6);
    assert.ok(distance(result.arc.b, b.b) < 1e-6);
    assert.equal(result.sketch.curves.length, radius < 25 - 1e-7 ? 2 : 1);
    if (radius >= 25) assert.ok(distance(result.arc.a, a.b) < 1e-6);
  }
});

test("line/arc and arc/arc rounding preserves supporting circles, numeric edits and Undo", async () => {
  for (const curvedA of [false, true])
    for (const side of [-1, 1]) {
      const line = segment({ x: 0, y: 0 }, { x: 20, y: 0 });
      const a = curvedA ? bowRadius(line, 30, side) : line;
      const b = bowRadius(segment({ x: 0, y: 0 }, { x: 0, y: 15 }), 25, -side);
      const original = { ...emptySketch(planes.XY), curves: [a, b] };
      const result = createFillet(original, filletCorner(a, b, "a", "a"), 2);
      validateSketch(result.sketch);
      for (const source of [a, b]) {
        if (source.kind !== "arc") continue;
        const kept = result.sketch.curves.find((c) => c.id === source.id);
        assert.ok(kept?.kind === "arc");
        assert.ok(distance(arcCircle(source).center, arcCircle(kept).center) < 1e-6);
      }
      assert.ok(existingFillet(result.sketch, result.arc));
      const edited = editFilletRadius(result.sketch, result.arc, 3);
      assert.ok(edited);
      validateSketch(edited);
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
        assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
        assert.equal((await owner.call({ kind: "edit", sketch: edited })).error, undefined);
        await owner.call({ kind: "undo" });
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data.sketches[0], original);
      } finally {
        owner.close();
      }
      const consumed = createFillet(original, filletCorner(a, b, "a", "a"), 100);
      validateSketch(consumed.sketch);
      assert.equal(consumed.sketch.curves.length, 1);
      assert.ok(distance(consumed.arc.a, a.b) < 1e-6 && distance(consumed.arc.b, b.b) < 1e-6);
    }
});

test("curved rounding consumes supports progressively without reintroducing them", () => {
  for (const side of [-1, 1]) {
    const a = bowRadius(segment({ x: 0, y: 0 }, { x: 20, y: 0 }), 30, side);
    const b = bowRadius(segment({ x: 0, y: 0 }, { x: 0, y: 15 }), 25, -side);
    const sketch = { ...emptySketch(planes.XY), curves: [a, b] };
    const corner = filletCorner(a, b, "a", "a");
    let count = 3;
    for (let radius = 0.25; radius <= 60; radius += 0.25) {
      const rounded = createFillet(sketch, corner, radius);
      validateSketch(rounded.sketch);
      assert.ok(rounded.sketch.curves.length <= count);
      count = rounded.sketch.curves.length;
    }
    assert.equal(count, 1);
  }
});
