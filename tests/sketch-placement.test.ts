import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { placedFrame } from "../src/sketch/sketch-placement.js";

test("placement preserves local geometry, uses one Undo and rejects invalid frames atomically", async () => {
  const owner = new DocumentOwner();
  const sketch = rectangle(emptySketch(planes.XY), { x: -10, y: -5 }, { x: 10, y: 5 }).sketch;
  try {
    await owner.call({ kind: "edit", sketch });
    const before = owner.view.data;
    const frame = placedFrame(sketch, "X", true, 30);
    const moved = await owner.call({ kind: "place-sketch", sketchId: sketch.id, frame });
    assert.equal(moved.error, undefined);
    assert.deepEqual(owner.view.data.sketches[0].curves, before.sketches[0].curves);
    assert.deepEqual(owner.view.data.sketches[0].constraints, before.sketches[0].constraints);
    assert.ok(Math.abs(owner.view.data.sketches[0].plane.v[2] - 0.5) < 1e-12);
    const accepted = owner.view.data;
    const bad = await owner.call({
      kind: "place-sketch",
      sketchId: sketch.id,
      frame: { ...frame, v: frame.u },
    });
    assert.match(bad.error ?? "", /perpendicular/);
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "delete-sketch", sketchId: sketch.id });
    assert.equal(owner.view.data.sketches.length, 0);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("placement rotates the plane around a relocated world anchor", () => {
  const sketch = emptySketch({ ...planes.XY, origin: [5, 8, 0] });
  const frame = placedFrame(sketch, "Z", true, 90, [0, 0, 0]);
  assert.ok(Math.abs(frame.origin[0] + 8) < 1e-12);
  assert.ok(Math.abs(frame.origin[1] - 5) < 1e-12);
  assert.deepEqual(sketch.plane.origin, [5, 8, 0]);
});
