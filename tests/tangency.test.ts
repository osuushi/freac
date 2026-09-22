import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { appendCircle, circleRadius } from "../src/sketch/circle-edit.js";
import { emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints } from "../src/sketch/point-links.js";
import { makeTangent, tangentContact } from "../src/sketch/tangency.js";

test("line/circle tangency changes first selection, follows radius edits and preserves Undo", async () => {
  for (const lineFirst of [true, false]) {
    const { sketch, curve: circle } = appendCircle(emptySketch(planes.XY), { x: 0, y: 0 }, 3);
    const line = segment({ x: -8, y: 6 }, { x: 8, y: 6 });
    const original = { ...sketch, curves: [circle, line] };
    const a = lineFirst ? line : circle,
      b = lineFirst ? circle : line;
    const target = makeTangent(original, a, b);
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
      const linked = owner.view.data.sketches[0];
      assert.deepEqual(
        linked.curves.find((c) => c.id === b.id),
        b,
      );
      tangentContact(linked.curves[0], linked.curves[1], -1);
      assert.equal(
        (await owner.call({ kind: "edit", sketch: circleRadius(linked, circle.id, 4) })).error,
        undefined,
      );
      const edited = owner.view.data.sketches[0];
      tangentContact(edited.curves[0], edited.curves[1], -1);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], linked);
    } finally {
      owner.close();
    }
  }
});

test("tangency rejects invisible contacts and conflicting incidence without losing geometry", async () => {
  const { sketch, curve: circle } = appendCircle(emptySketch(planes.XY), { x: 0, y: 0 }, 3);
  const remote = segment({ x: 20, y: 6 }, { x: 30, y: 6 });
  assert.throws(
    () => makeTangent({ ...sketch, curves: [circle, remote] }, remote, circle),
    /outside/,
  );
  const arc = bowThrough(segment({ x: 3, y: 4 }, { x: 4, y: 3 }), {
    x: Math.sqrt(12.5),
    y: Math.sqrt(12.5),
  });
  const below = segment({ x: -8, y: -10 }, { x: 8, y: -10 });
  assert.throws(() => makeTangent({ ...sketch, curves: [arc, below] }, below, arc), /outside/);
  const upper = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 2 });
  const visible = makeTangent({ ...sketch, curves: [upper, below] }, below, upper);
  tangentContact(visible.curves[0], visible.curves[1], -1);
  assert.deepEqual(
    visible.curves[0],
    upper,
    "The visible opposite branch keeps the reference arc fixed",
  );
  assert.equal(visible.curves[1].kind === "segment" && visible.curves[1].a.y, 2);
  const radial = segment({ x: 0, y: 0 }, { x: 8, y: 0 });
  const original = fusePoints({ ...sketch, curves: [circle, radial] }, [
    { curve: circle.id, end: "center" },
    { curve: radial.id, end: "a" },
  ]);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    const before = owner.view.data;
    const target = makeTangent(original, radial, circle);
    assert.ok((await owner.call({ kind: "edit", sketch: target })).error);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
