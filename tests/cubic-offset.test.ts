import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bezierAt } from "../src/sketch/bezier-geometry.js";
import { cubicOffsetProfile } from "../src/sketch/cubic-offset-target.js";
import { closestOnCurve } from "../src/sketch/curve-geometry.js";
import type { Sketch } from "../src/sketch/document.js";
import { distance } from "../src/sketch/geometry.js";
import { hasClosedEndpoints } from "../src/sketch/loop-boundary.js";

const sketch: Sketch = JSON.parse(readFileSync("tests/fixtures/offset-cubic-section.json", "utf8"));
const operation = (amount: number) => ({
  kind: "offset-sketch" as const,
  sketchId: sketch.id,
  curves: sketch.curves.map((c) => c.id),
  amount,
});

test("captured cubic section offsets remain closed, equidistant, editable and undoable", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    const source = cubicOffsetProfile(sketch.curves);
    for (const amount of [0.2, -0.2, 1, 2]) {
      assert.equal((await owner.call(operation(amount))).error, undefined);
      assert.deepEqual(owner.view.data, before);
      const candidate = owner.view.candidate?.sketches[0];
      assert.ok(candidate);
      const added = candidate.curves.filter((c) => !sketch.curves.some((s) => s.id === c.id));
      assert.ok(hasClosedEndpoints(added));
      assert.equal(Math.sign(cubicOffsetProfile(added).area - source.area), Math.sign(amount));
      for (const curve of added)
        if (curve.kind === "bezier") {
          for (const t of [0, 0.2, 0.5, 0.8, 1]) {
            const point = bezierAt(curve, t);
            const gap = Math.min(
              ...sketch.curves.map((c) => distance(point, closestOnCurve(c, point))),
            );
            assert.ok(
              Math.abs(gap - Math.abs(amount)) < 0.0011,
              `offset distance ${gap} != ${amount}`,
            );
          }
        }
      assert.deepEqual(candidate.curves.slice(0, sketch.curves.length), sketch.curves);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data.sketches[0], candidate);
      await owner.call({ kind: "undo" });
    }
    for (const amount of [-1, -20, 0, Number.NaN]) {
      assert.ok((await owner.call(operation(amount))).error);
      assert.equal(owner.view.candidate, null);
      assert.deepEqual(owner.view.data, before);
    }
    assert.ok(
      (await owner.call({ ...operation(1), curves: sketch.curves.slice(1).map((c) => c.id) }))
        .error,
    );
    assert.equal((await owner.call(operation(0.2))).error, undefined);
    await owner.call({ kind: "cancel-preview" });
    assert.equal(owner.view.candidate, null);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
