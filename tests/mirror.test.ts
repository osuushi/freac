import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { mirrorSketch } from "../src/backend/mirror-sketch.js";
import type { MirrorOperation } from "../src/model/mirror.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import { emptySketch, type Sketch, validateSketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

const line = { origin: { x: 2, y: 0 }, direction: { x: 0, y: 1 } };
function operation(
  sketch: Sketch,
  keepOriginal = true,
): Extract<MirrorOperation, { kind: "sketch" }> {
  return {
    kind: "sketch",
    sketchId: sketch.id,
    ids: sketch.curves.map((c) => c.id),
    line,
    keepOriginal,
  };
}
test("mirror reflects every curve kind exactly, reverses arc winding and preserves independent IDs", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XZ),
    curves: [
      { id: "l", kind: "segment", a: { x: 3, y: 1 }, b: { x: 6, y: 1 }, construction: true },
      { id: "c", kind: "circle", center: { x: 9, y: 4 }, radius: 2, construction: false },
      {
        id: "a",
        kind: "arc",
        a: { x: 3, y: 0 },
        b: { x: 5, y: 0 },
        bulge: 0.5,
        construction: false,
      },
      {
        id: "b",
        kind: "bezier",
        a: { x: 5, y: 5 },
        c1: { x: 7, y: 9 },
        c2: { x: 9, y: 2 },
        b: { x: 12, y: 3 },
        construction: false,
      },
    ],
    constraints: [{ id: "radius", kind: "radius", curve: "c", value: 2 }],
  };
  const result = mirrorSketch(sketch, operation(sketch));
  assert.deepEqual(result.curves.slice(0, 4), sketch.curves);
  assert.equal(new Set(result.curves.map((c) => c.id)).size, 8);
  const [l, c, a, b] = result.curves.slice(4);
  assert.ok(l.kind === "segment" && c.kind === "circle" && a.kind === "arc" && b.kind === "bezier");
  assert.deepEqual(l.a, { x: 1, y: 1 });
  assert.equal(l.construction, true);
  assert.deepEqual(c.center, { x: -5, y: 4 });
  assert.equal(a.bulge, -0.5);
  assert.equal(arcCircle(a).center.x, 0);
  assert.deepEqual(b.c1, { x: -3, y: 9 });
  const replaced = mirrorSketch(sketch, operation(sketch, false));
  assert.deepEqual(mirrorSketch(replaced, operation(replaced, false)), sketch);
});

test("mirror remaps internal links, signed angle and tangent side; conflicting locks reject", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "l", kind: "segment", a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, construction: false },
      { id: "v", kind: "segment", a: { x: 8, y: 0 }, b: { x: 8, y: 6 }, construction: false },
      { id: "c", kind: "circle", center: { x: 4, y: 2 }, radius: 2, construction: false },
    ],
    constraints: [
      { id: "h", kind: "horizontal", a: "l" },
      { id: "join", kind: "coincident", a: { curve: "l", end: "b" }, b: { curve: "v", end: "a" } },
      { id: "angle", kind: "corner-angle", a: "l", b: "v", aEnd: "b", bEnd: "a", value: -90 },
      { id: "tangent", kind: "tangent", a: "l", b: "c", side: 1 },
    ],
  };
  validateSketch(sketch);
  const result = mirrorSketch(sketch, operation(sketch));
  validateSketch(result);
  assert.equal(result.constraints.length, 8);
  assert.ok(result.constraints.some((c) => c.kind === "corner-angle" && c.value === 90));
  assert.ok(result.constraints.some((c) => c.kind === "tangent" && c.side === -1));
  const partial = mirrorSketch(sketch, { ...operation(sketch), ids: ["l"] });
  assert.equal(partial.constraints.length, 5, "external links are not cloned");
  assert.throws(
    () => mirrorSketch(sketch, { ...operation(sketch, false), ids: ["l"] }),
    /constraints/,
  );
  assert.throws(
    () =>
      mirrorSketch(sketch, {
        ...operation(sketch),
        line: { origin: { x: 0, y: 0 }, direction: { x: 2, y: 1 } },
      }),
    /axis constraint/,
  );
  assert.throws(
    () =>
      mirrorSketch(sketch, { ...operation(sketch), line: { ...line, direction: { x: 0, y: 0 } } }),
    /nonzero/,
  );
});

test("sketch mirror preview uses exact accepted geometry and retains redo on rejection", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch: Sketch = {
      ...emptySketch(planes.YZ),
      curves: [
        { id: "l", kind: "segment", a: { x: 4, y: 1 }, b: { x: 8, y: 1 }, construction: false },
      ],
      constraints: [{ id: "h", kind: "horizontal", a: "l" }],
    };
    await owner.call({ kind: "edit", sketch });
    const before = owner.view.data;
    assert.equal(
      (await owner.call({ kind: "mirror", operation: operation(sketch) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "accept" });
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    const bad = { ...operation(sketch), line: { ...line, direction: { x: 1, y: 2 } } };
    assert.ok((await owner.call({ kind: "mirror", operation: bad })).error);
    assert.equal(owner.view.canRedo, true);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});
