import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import { spanArea } from "../src/sketch/curve-spans.js";
import { emptySketch, newId, type Sketch, validateSketch } from "../src/sketch/document.js";
import { createFillet, editFilletRadius, existingFillet } from "../src/sketch/fillet-edit.js";
import { filletCorner } from "../src/sketch/fillet-geometry.js";
import { distance, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { closedBoundaries } from "../src/sketch/regions.js";

test("fillets preserve finite supports, infer radius editing from relations and Undo atomically", async () => {
  for (const angle of [45, 90, 135, -90]) {
    const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
    const b = segment(
      { x: 0, y: 0 },
      { x: 10 * Math.cos((angle * Math.PI) / 180), y: 10 * Math.sin((angle * Math.PI) / 180) },
    );
    const original = { ...emptySketch(planes.XY), curves: [a, b] };
    const corner = filletCorner(a, b, "a", "a");
    const result = createFillet(original, corner, 2);
    validateSketch(result.sketch);
    assert.equal(result.removed.length, 0);
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
      const accepted = owner.view.data.sketches[0],
        arc = accepted.curves.find((c) => c.id === result.arc.id);
      assert.ok(arc?.kind === "arc");
      assert.ok(existingFillet(accepted, arc));
      assert.ok(Math.abs(arcCircle(arc).radius - 2) < 1e-7);
      const resized = editFilletRadius(accepted, arc, 3);
      assert.ok(resized);
      assert.equal((await owner.call({ kind: "edit", sketch: resized })).error, undefined);
      const larger = owner.view.data.sketches[0].curves.find((c) => c.id === arc.id);
      assert.ok(larger?.kind === "arc");
      assert.ok(Math.abs(arcCircle(larger).radius - 3) < 1e-7);
      assert.ok(distance(larger.a, arc.a) > 0.1);
      assert.throws(() => editFilletRadius(accepted, arc, -1));
      await owner.call({ kind: "undo" });
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], original);
    } finally {
      owner.close();
    }
  }
});
test("fillet reports shortened-edge locks and point links while preserving support constraints", () => {
  const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 }),
    b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [a, b],
    constraints: [
      { id: newId(), kind: "length", curve: a.id, value: 10 },
      { id: newId(), kind: "horizontal", a: a.id },
      {
        id: newId(),
        kind: "coincident",
        a: { curve: a.id, end: "a" },
        b: { curve: b.id, end: "a" },
      },
    ],
  };
  const result = createFillet(original, filletCorner(a, b, "a", "a"), 2);
  assert.deepEqual(result.removed.map((c) => c.kind).sort(), ["coincident", "length"]);
  assert.ok(result.sketch.constraints.some((c) => c.kind === "horizontal"));
  validateSketch(result.sketch);
});

test("fillet retains a corner angle and a hub's other links, including reversed edge directions", async () => {
  const a = segment({ x: 10, y: 0 }, { x: 0, y: 0 }),
    b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
  const other = segment({ x: 0, y: 0 }, { x: -10, y: 0 }),
    last = segment({ x: 0, y: 0 }, { x: 0, y: -10 });
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [a, b, other, last],
    constraints: [
      { id: newId(), kind: "corner-angle", a: a.id, b: b.id, aEnd: "b", bEnd: "a", value: 90 },
      ...[b, other, last].map((c) => ({
        id: newId(),
        kind: "coincident" as const,
        a: { curve: a.id, end: "b" as const },
        b: { curve: c.id, end: "a" as const },
      })),
    ],
  };
  const result = createFillet(original, filletCorner(a, b, "b", "a"), 2);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
    const accepted = owner.view.data.sketches[0];
    assert.ok(accepted.constraints.some((c) => c.kind === "corner-angle"));
    assert.deepEqual(accepted.curves[2], other);
    assert.deepEqual(accepted.curves[3], last);
    assert.ok(
      accepted.constraints.some(
        (c) =>
          c.kind === "coincident" &&
          [c.a.curve, c.b.curve].includes(other.id) &&
          [c.a.curve, c.b.curve].includes(last.id),
      ),
    );
  } finally {
    owner.close();
  }
});

test("a rounded line loop retains an analytic closed region", () => {
  const a = segment({ x: 0, y: 0 }, { x: 10, y: 0 }),
    b = segment({ x: 0, y: 0 }, { x: 0, y: 10 });
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      a,
      b,
      segment({ x: 10, y: 0 }, { x: 10, y: 10 }),
      segment({ x: 10, y: 10 }, { x: 0, y: 10 }),
    ],
  };
  const result = createFillet(sketch, filletCorner(a, b, "a", "a"), 2);
  const boundaries = closedBoundaries(result.sketch.curves);
  assert.equal(boundaries.length, 1);
  const area = boundaries[0].reduce((total, span) => total + spanArea(span), 0);
  assert.ok(Math.abs(area - (100 - 4 + Math.PI)) < 1e-7);
});

test("fillet consumes one or both original supports and preserves far-end links", async () => {
  for (const length of [10, 20]) {
    const a = segment({ x: 0, y: 0 }, { x: length, y: 0 });
    const b = segment({ x: 0, y: 10 }, { x: 0, y: 0 });
    const next = segment({ x: 0, y: 10 }, { x: -5, y: 10 });
    const original: Sketch = {
      ...emptySketch(planes.XY),
      curves: [a, b, next],
      constraints: [
        {
          id: newId(),
          kind: "coincident",
          a: { curve: b.id, end: "a" },
          b: { curve: next.id, end: "a" },
        },
      ],
    };
    const result = createFillet(original, filletCorner(a, b, "a", "b"), 10);
    validateSketch(result.sketch);
    assert.equal(result.sketch.curves.length, length === 10 ? 2 : 3);
    assert.deepEqual(
      result.sketch.curves.find((c) => c.id === next.id),
      next,
    );
    assert.ok(
      result.sketch.constraints.some(
        (c) => c.kind === "coincident" && c.a.curve === result.arc.id && c.b.curve === next.id,
      ),
    );
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], original);
    } finally {
      owner.close();
    }
    const small = createFillet(original, filletCorner(a, b, "a", "b"), 2);
    const grown = editFilletRadius(small.sketch, small.arc, 10);
    assert.ok(grown);
    validateSketch(grown);
    assert.equal(grown.curves.length, result.sketch.curves.length);
  }
});
