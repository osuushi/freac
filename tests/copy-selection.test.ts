import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { appendSelection, copySelection } from "../src/sketch/copy-selection.js";
import { emptySketch, validateSketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";

test("copies preserve internal constraints/groups, drop outside links, and reuse preview IDs", () => {
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 5 }).sketch;
  const ids = new Map<string, string>();
  const selected = new Set(sketch.curves.map((c) => c.id));
  const copy = copySelection(sketch, selected, ids);
  assert.equal(copy.groups.length, 1);
  assert.equal(copy.constraints.length, sketch.constraints.length);
  assert.deepEqual(copySelection(sketch, selected, ids), copy);
  const originals = new Set(
    [...sketch.curves, ...sketch.constraints, ...sketch.groups].map((c) => c.id),
  );
  assert.ok(
    [...copy.curves, ...copy.constraints, ...copy.groups].every((c) => !originals.has(c.id)),
  );
  validateSketch(appendSelection(sketch, copy));
  const reversed = copySelection(sketch, new Set([...selected].reverse()), ids);
  assert.deepEqual(
    reversed.curves.map((c) => c.id),
    copy.curves.map((c) => c.id).reverse(),
  );
  const partial = copySelection(sketch, new Set([sketch.curves[0].id]));
  assert.equal(partial.curves.length, 1);
  assert.equal(partial.groups.length, 0);
  assert.ok(partial.constraints.every((c) => c.kind === "horizontal" || c.kind === "vertical"));
  validateSketch(appendSelection(sketch, partial));
});

test("whole-sketch copy is independently placed, editable, and one Undo", async () => {
  const owner = new DocumentOwner();
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 5 }).sketch;
  try {
    await owner.call({ kind: "edit", sketch });
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "place-sketch",
      sketchId: sketch.id,
      frame: { ...planes.XY, origin: [0, 0, 20] },
      duplicate: true,
    });
    assert.equal(reply.error, undefined);
    const accepted = owner.view.data;
    assert.equal(accepted.sketches.length, 2);
    assert.deepEqual(accepted.sketches[0], before.sketches[0]);
    const copy = accepted.sketches[1];
    assert.notEqual(copy.id, sketch.id);
    assert.deepEqual(copy.plane.origin, [0, 0, 20]);
    validateSketch(copy);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "remove", sketchId: copy.id, ids: [copy.curves[0].id] });
    assert.equal(owner.view.data.sketches[1].curves.length, 3);
    assert.deepEqual(owner.view.data.sketches[0], before.sketches[0]);
  } finally {
    owner.close();
  }
});
