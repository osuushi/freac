import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { radiusEdit } from "../src/sketch/arc-edit.js";
import { arcCircle, bowThrough } from "../src/sketch/arc-geometry.js";
import { type Arc, emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { makeCoincident } from "../src/sketch/point-links.js";

test("concentric arc radius edits preserve the other arc's radius and sweep", async () => {
  const a = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 8 }) as Arc;
  const b = bowThrough(segment({ x: 6, y: 0 }, { x: 10, y: 0 }), { x: 8, y: 1 }) as Arc;
  const original = { ...emptySketch(planes.XY), curves: [a, b] };
  const linked = makeCoincident(original, [
    { curve: a.id, end: "center" },
    { curve: b.id, end: "center" },
  ]);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: linked })).error, undefined);
    const source = owner.view.data.sketches[0].curves[0] as Arc;
    const target = radiusEdit(owner.view.data.sketches[0], source, 6, 1);
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    const result = owner.view.data.sketches[0].curves[1] as Arc;
    assert.ok(Math.abs(arcCircle(result).radius - arcCircle(b).radius) < 1e-7);
    assert.ok(Math.abs(result.bulge - b.bulge) < 1e-7);
  } finally {
    owner.close();
  }
});
