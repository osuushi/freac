import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { mergeSketches } from "../src/sketch/sketch-merge.js";

test("merging coplanar sketches remaps IDs and preserves world geometry", () => {
  const target = { ...emptySketch(planes.XY), curves: [segment({ x: 0, y: 0 }, { x: 1, y: 0 })] };
  const source = {
    ...emptySketch({
      origin: [3, 4, 0],
      u: [0, 1, 0],
      v: [-1, 0, 0],
    }),
    curves: [segment({ x: 2, y: 1 }, { x: 4, y: 1 })],
  };
  const merged = mergeSketches(target, [source]);
  assert.equal(merged.curves.length, 2);
  assert.notEqual(merged.curves[0].id, merged.curves[1].id);
  const curve = merged.curves[1];
  assert.equal(curve.kind, "segment");
  assert.deepEqual(curve.a, { x: 2, y: 6 });
  assert.deepEqual(curve.b, { x: 2, y: 8 });
});

test("document merge is one undoable operation", async () => {
  const owner = new DocumentOwner();
  try {
    const target = { ...emptySketch(planes.XY), curves: [segment({ x: 0, y: 0 }, { x: 1, y: 0 })] };
    const source = { ...emptySketch(planes.XY), curves: [segment({ x: 2, y: 0 }, { x: 3, y: 0 })] };
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
    const reply = await owner.call({
      kind: "merge-sketches",
      targetSketchId: target.id,
      sourceSketchIds: [source.id],
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.data.sketches.length, 1);
    assert.equal(reply.view.data.sketches[0].id, target.id);
    assert.equal(reply.view.data.sketches[0].curves.length, 2);
    await owner.call({ kind: "undo" });
    assert.deepEqual(
      owner.view.data.sketches.map((sketch) => sketch.id),
      [target.id, source.id],
    );
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data.sketches.length, 1);
  } finally {
    owner.close();
  }
});
