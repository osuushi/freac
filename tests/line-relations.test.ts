import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type Segment, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("horizontal drag preserves the opposite endpoint and projects the target", async () => {
  const line = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [line],
    constraints: [{ id: "h", kind: "horizontal", a: line.id }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const target = { ...sketch, curves: [{ ...line, b: { x: 14, y: 4 } }] };
    const result = await owner.call({
      kind: "preview",
      sketch: target,
      intent: { kind: "point", targets: [{ curve: line.id, end: "b" }] },
    });
    assert.equal(result.error, undefined);
    const actual = result.view.candidate?.sketches[0].curves[0] as Segment;
    near(actual.a.x, 0);
    near(actual.a.y, 0);
    near(actual.b.x, 14);
    near(actual.b.y, 0);
  } finally {
    owner.close();
  }
});
test("equal length follows editing from either side without changing the other relationship", async () => {
  const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 }),
    b = segment({ x: 0, y: 10 }, { x: 10, y: 10 });
  let sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [a, b],
    constraints: [{ id: "e", kind: "equal", a: a.id, b: b.id }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    for (const [id, length] of [
      [a.id, 15],
      [b.id, 20],
    ] as const) {
      sketch = owner.view.data.sketches[0];
      const curves = sketch.curves.map((c) =>
        c.id === id && c.kind === "segment" ? { ...c, b: { x: c.a.x + length, y: c.a.y } } : c,
      );
      const reply = await owner.call({ kind: "edit", sketch: { ...sketch, curves } });
      assert.equal(reply.error, undefined);
      for (const curve of reply.view.data.sketches[0].curves as Segment[])
        near(Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y), length);
    }
  } finally {
    owner.close();
  }
});

test("duplicate relations and conflicting numeric locks reject without losing Undo/Redo", async () => {
  const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 }),
    b = segment({ x: 0, y: 10 }, { x: 10, y: 10 });
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [a, b],
    constraints: [
      { id: "e", kind: "equal", a: a.id, b: b.id },
      { id: "l", kind: "length", curve: b.id, value: 10 },
    ],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const bad = { ...sketch, curves: [{ ...a, b: { x: 15, y: 0 } }, b] };
    assert.ok((await owner.call({ kind: "edit", sketch: bad })).error);
    assert.deepEqual(owner.view.data.sketches[0], sketch);
    const duplicate = {
      ...sketch,
      constraints: [...sketch.constraints, { id: "e2", kind: "equal" as const, a: a.id, b: b.id }],
    };
    assert.ok((await owner.call({ kind: "edit", sketch: duplicate })).error);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.sketches.length, 0);
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});
