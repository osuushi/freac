import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowThrough } from "../src/sketch/arc-geometry.js";
import {
  type Circle,
  emptySketch,
  newId,
  type Sketch,
  validateSketch,
} from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { trimSketch } from "../src/sketch/trim-edit.js";
import { trimAt, trimRemainders, trimSpans } from "../src/sketch/trim-geometry.js";

const line = (ax: number, ay: number, bx: number, by: number) =>
  segment({ x: ax, y: ay }, { x: bx, y: by });

test("trim splits only at actual contacts, including collinear endpoints, and preserves direction", () => {
  const source = line(-10, 0, 10, 0),
    cuts = [line(-4, -5, -4, 5), line(3, -5, 3, 5), line(0, 0.01, 0, 3)];
  const pieces = trimRemainders(trimAt(source, [source, ...cuts], { x: 0, y: 0 }));
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].kind, "segment");
  if (pieces[0].kind !== "segment" || pieces[1].kind !== "segment") return;
  assert.deepEqual(pieces[0].a, { x: -10, y: 0 });
  assert.deepEqual(pieces[0].b, { x: -4, y: 0 });
  assert.deepEqual(pieces[1].a, { x: 3, y: 0 });
  assert.deepEqual(pieces[1].b, { x: 10, y: 0 });
  assert.equal(trimSpans(source, [line(-2, 0, 2, 0)]).length, 3);
  assert.equal(trimSpans(source, [line(0, 0.01, 0, 3)]).length, 1);
});
test("circles use real contacts, not seams; bounded major/minor arcs retain finite domains", () => {
  const circle: Circle = {
    id: newId(),
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    construction: false,
  };
  assert.equal(trimRemainders(trimAt(circle, [], { x: 5, y: 0 })).length, 0);
  assert.equal(trimRemainders(trimAt(circle, [line(-10, 5, 10, 5)], { x: 0, y: -5 })).length, 0);
  const span = trimAt(circle, [line(-10, 0, 10, 0)], { x: 0, y: 5 });
  const [arc] = trimRemainders(span);
  assert.equal(arc.kind, "arc");
  if (arc.kind !== "arc") return;
  assert.ok(Math.abs(arcCircle(arc).radius - 5) < 1e-7);
  assert.ok(Math.abs(arc.bulge - 1) < 1e-7);
  const major = bowThrough(line(-4, 0, 4, 0), { x: 0, y: 8 });
  assert.ok(major.kind === "arc");
  const parts = trimRemainders(trimAt(major, [line(-10, 5, 10, 5)], { x: 0, y: 8 }));
  assert.equal(parts.length, 2);
  for (const part of parts) {
    assert.ok(part.kind === "arc");
    assert.ok(Math.abs(arcCircle(part).radius - 5) < 1e-7);
  }
});
test("trim remaps endpoint links to their remnants, reports length loss and retains native Undo", async () => {
  const source = line(-10, 0, 10, 0),
    left = line(-10, 0, -10, 4),
    right = line(10, 0, 10, 4);
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [source, left, right, line(-4, -5, -4, 5), line(3, -5, 3, 5)],
    constraints: [
      { id: newId(), kind: "length", curve: source.id, value: 20 },
      { id: newId(), kind: "horizontal", a: source.id },
      {
        id: newId(),
        kind: "coincident",
        a: { curve: source.id, end: "a" },
        b: { curve: left.id, end: "a" },
      },
      {
        id: newId(),
        kind: "coincident",
        a: { curve: source.id, end: "b" },
        b: { curve: right.id, end: "a" },
      },
    ],
  };
  const result = trimSketch(original, trimAt(source, original.curves, { x: 0, y: 0 }));
  assert.deepEqual(
    result.removed.map((c) => c.kind),
    ["length"],
  );
  validateSketch(result.sketch);
  assert.equal(result.sketch.constraints.filter((c) => c.kind === "horizontal").length, 1);
  assert.equal(result.sketch.constraints.filter((c) => c.kind === "coincident").length, 2);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], original);
  } finally {
    owner.close();
  }
});

test("rectangle trim preserves surviving right angles without redundant direction copies", async () => {
  for (const middle of [false, true]) {
    const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 });
    const source = made.sketch.curves[0];
    const original = {
      ...made.sketch,
      curves: [...made.sketch.curves, ...(middle ? [line(3, -5, 3, 5), line(7, -5, 7, 5)] : [])],
    };
    const result = trimSketch(original, trimAt(source, original.curves, { x: 5, y: 0 }));
    assert.equal(result.sketch.groups.length, 0);
    validateSketch(result.sketch);
    assert.ok(result.sketch.constraints.some((c) => c.kind === "perpendicular"));
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      const before = owner.view.data;
      assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
    } finally {
      owner.close();
    }
  }
});

test("trim keeps circular radius and center relationships on both arc remnants", async () => {
  const arc = bowThrough(line(-4, 0, 4, 0), { x: 0, y: 8 });
  assert.ok(arc.kind === "arc");
  const anchor = line(0, 3, -2, 3),
    cutter = line(-10, 5, 10, 5);
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [arc, anchor, cutter],
    constraints: [
      { id: newId(), kind: "radius", curve: arc.id, value: 5 },
      {
        id: newId(),
        kind: "coincident",
        a: { curve: arc.id, end: "center" },
        b: { curve: anchor.id, end: "a" },
      },
    ],
  };
  const result = trimSketch(original, trimAt(arc, original.curves, { x: 0, y: 8 }));
  assert.equal(result.removed.length, 0);
  assert.equal(result.sketch.constraints.filter((c) => c.kind === "radius").length, 2);
  assert.equal(result.sketch.constraints.filter((c) => c.kind === "coincident").length, 2);
  validateSketch(result.sketch);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
