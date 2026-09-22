import assert from "node:assert/strict";
import test from "node:test";
import { type Circle, emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { appendLine } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";

const circle = (id: string, radius: number): Circle => ({
  id,
  kind: "circle",
  construction: false,
  center: { x: 0, y: 0 },
  radius,
});
test("exact nested circular profiles partition disks and annuli without tessellation", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [circle("outer", 10), circle("middle", 5), circle("inner", 2)],
  };
  assert.equal(profilesFor(sketch).length, 3);
  for (const [x, area, holes] of [
    [8, 75 * Math.PI, 1],
    [3, 21 * Math.PI, 1],
    [0, 4 * Math.PI, 0],
  ]) {
    const profile = profileAt(sketch, { x, y: 0 });
    assert.ok(profile);
    assert.ok(Math.abs(profile.area - area) < 1e-8);
    assert.equal(profile.holes.length, holes);
  }
  assert.equal(profileAt(sketch, { x: 10.000001, y: 0 }), undefined);
  assert.ok(profileAt(sketch, { x: 9.999999, y: 0 }));
});
test("crossing cells and disjoint outlines remain independently selectable", () => {
  const base = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 }).sketch;
  const divided = appendLine(base, { x: 0, y: 0 }, { x: 10, y: 10 }).sketch;
  const sketch = rectangle(divided, { x: 20, y: 0 }, { x: 30, y: 10 }).sketch;
  assert.equal(profilesFor(sketch).length, 3);
  assert.equal(profileAt(sketch, { x: 2, y: 7 })?.area, 50);
  assert.equal(profileAt(sketch, { x: 7, y: 2 })?.area, 50);
  assert.equal(profileAt(sketch, { x: 25, y: 5 })?.area, 100);
});

test("arc-bound profiles use the bounded circular span for exact hits and area", () => {
  const sketch: import("../src/sketch/document.js").Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "arc",
        kind: "arc",
        a: { x: -5, y: 0 },
        b: { x: 5, y: 0 },
        bulge: 1,
        construction: false,
      },
      { id: "chord", kind: "segment", a: { x: 5, y: 0 }, b: { x: -5, y: 0 }, construction: false },
    ],
  };
  const profile = profileAt(sketch, { x: 0, y: -2 });
  assert.ok(profile);
  assert.ok(Math.abs(profile.area - Math.PI * 12.5) < 1e-8);
  assert.equal(profileAt(sketch, { x: 0, y: 2 }), undefined);
});
