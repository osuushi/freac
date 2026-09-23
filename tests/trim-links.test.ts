import assert from "node:assert/strict";
import test from "node:test";
import { emptySketch, validateSketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { trimOverlappingSketch } from "../src/sketch/trim-edit.js";
import { trimAt } from "../src/sketch/trim-geometry.js";

const line = (ax: number, ay: number, bx: number, by: number) =>
  segment({ x: ax, y: ay }, { x: bx, y: by });

test("trim fuses a new corner without linking untouched coincident endpoints", () => {
  const source = line(-10, 0, 10, 0);
  const original = {
    ...emptySketch(planes.XY),
    curves: [source, line(0, 0, 0, 5), line(-10, 0, -10, 5)],
  };
  const result = trimOverlappingSketch(original, trimAt(source, original.curves, { x: 5, y: 0 }));
  validateSketch(result.sketch);
  assert.equal(result.sketch.constraints.length, 1);
  assert.deepEqual(result.sketch.constraints[0], {
    id: result.sketch.constraints[0].id,
    kind: "coincident",
    a: { curve: source.id, end: "b" },
    b: { curve: original.curves[1].id, end: "a" },
  });
});

test("trim leaves ambiguous endpoint junctions and edge interiors unlinked", () => {
  for (const cutters of [[line(0, 0, 0, 5), line(0, 0, 2, 5)], [line(0, -5, 0, 5)]]) {
    const source = line(-10, 0, 10, 0);
    const original = { ...emptySketch(planes.XY), curves: [source, ...cutters] };
    const result = trimOverlappingSketch(original, trimAt(source, original.curves, { x: 5, y: 0 }));
    validateSketch(result.sketch);
    assert.equal(result.sketch.constraints.length, 0);
  }
});

test("overlap removal resolves corner links against final surviving endpoints", () => {
  const source = line(-10, 0, 10, 0);
  const original = {
    ...emptySketch(planes.XY),
    curves: [source, line(0, 0, 10, 0), line(0, 0, 0, 5)],
  };
  const result = trimOverlappingSketch(original, trimAt(source, original.curves, { x: 5, y: 0 }));
  validateSketch(result.sketch);
  assert.equal(result.sketch.curves.length, 2);
  assert.equal(result.sketch.constraints.length, 1);
});

test("a second remnant's new ID does not cause its untouched endpoint to Fuse", () => {
  const source = line(-10, 0, 10, 0);
  const original = {
    ...emptySketch(planes.XY),
    curves: [source, line(-2, -5, -2, 5), line(2, -5, 2, 5), line(10, 0, 10, 5)],
  };
  const result = trimOverlappingSketch(original, trimAt(source, original.curves, { x: 0, y: 0 }));
  validateSketch(result.sketch);
  assert.equal(result.sketch.constraints.length, 0);
});

test("the captured two-circle outline gets both corner links in either trim order", () => {
  const circles = [
    {
      id: "small",
      kind: "circle" as const,
      center: { x: -6, y: 0 },
      radius: 8,
      construction: false,
    },
    {
      id: "large",
      kind: "circle" as const,
      center: { x: 20, y: 6 },
      radius: Math.sqrt(520),
      construction: false,
    },
  ];
  const positions = [
    { x: 2, y: 0 },
    { x: 20 - Math.sqrt(520), y: 6 },
  ];
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    let sketch = { ...emptySketch(planes.XY), curves: [...circles] } as ReturnType<
      typeof emptySketch
    >;
    for (const index of order) {
      const curve = sketch.curves.find((c) => c.id === circles[index].id);
      assert.ok(curve);
      sketch = trimOverlappingSketch(sketch, trimAt(curve, sketch.curves, positions[index])).sketch;
    }
    validateSketch(sketch);
    assert.equal(sketch.constraints.length, 2);
    assert.ok(sketch.constraints.every((c) => c.kind === "coincident"));
    assert.ok(sketch.curves.every((c) => c.kind === "arc"));
  }
});
