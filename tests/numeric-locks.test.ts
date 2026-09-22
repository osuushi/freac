import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { NativeSolver } from "../src/backend/native-solver.js";
import { solverInput } from "../src/backend/solver-input.js";
import { checkResiduals } from "../src/backend/solver-residuals.js";
import { arcCircle, bowRadius, bowThrough } from "../src/sketch/arc-geometry.js";
import { numericConstraints } from "../src/sketch/constraint-geometry.js";
import { type Arc, type Circle, emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle, removeCurves, segment } from "../src/sketch/geometry.js";
import { lineDimension, transformSelection } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { dimensionRectangle } from "../src/sketch/rectangle-edit.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("native radius equation solves from the old radius and preserves arc branch", async () => {
  const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 }),
    arc = bowThrough(line, { x: 0, y: 8 }) as Arc;
  const original: Sketch = {
    ...emptySketch(planes.XY),
    curves: [arc],
    constraints: [{ id: "r", kind: "radius", curve: arc.id, value: 5 }],
  };
  const changed = {
    ...original,
    curves: [bowRadius(arc, 6, 1)],
    constraints: [{ ...original.constraints[0], value: 6 }],
  } as Sketch;
  const input = solverInput(changed, original);
  assert.deepEqual(input.radii, [5]);
  const solver = new NativeSolver();
  try {
    const result = await solver.solve(input);
    near(result.radii[0], 6);
    checkResiduals(input, result.points, result.radii);
  } finally {
    solver.close();
  }
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
    const solved = owner.view.data.sketches[0].curves[0] as Arc;
    near(arcCircle(solved).radius, 6);
    assert.ok(Math.abs(solved.bulge) > 1);
    assert.deepEqual(solved.a, arc.a);
    await owner.call({ kind: "undo" });
    near(arcCircle(owner.view.data.sketches[0].curves[0] as Arc).radius, 5);
    const conflict = { ...original, curves: [bowRadius(arc, 8, 1)] };
    assert.match(
      (await owner.call({ kind: "edit", sketch: conflict })).error ?? "",
      /Radius is locked/,
    );
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});
test("length locks allow translation and explicit value changes, reject conflicting drags", async () => {
  const curve = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [curve],
    constraints: [{ id: "l", kind: "length", curve: curve.id, value: 10 }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const moved = transformSelection(sketch, new Set([curve.id]), (p) => ({
      x: p.x + 3,
      y: p.y + 4,
    }));
    assert.equal((await owner.call({ kind: "edit", sketch: moved })).error, undefined);
    const bad = lineDimension(moved, curve.id, "length", 20);
    assert.match((await owner.call({ kind: "edit", sketch: bad })).error ?? "", /Length is locked/);
    const edited = {
      ...bad,
      constraints: [{ id: "l", kind: "length" as const, curve: curve.id, value: 20 }],
    };
    assert.equal((await owner.call({ kind: "edit", sketch: edited })).error, undefined);
    const output = owner.view.data.sketches[0];
    assert.equal(numericConstraints(output)[0].value, 20);
    assert.equal(removeCurves(output, new Set([curve.id])).constraints.length, 0);
  } finally {
    owner.close();
  }
});
test("rectangle width lock shares opposite sides; radius and malformed locks remain independent", async () => {
  const made = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 5 });
  const circle: Circle = {
    id: "circle",
    kind: "circle",
    center: { x: 30, y: 0 },
    radius: 4,
    construction: false,
  };
  const sketch: Sketch = {
    ...made.sketch,
    curves: [...made.sketch.curves, circle],
    constraints: [
      ...made.sketch.constraints,
      { id: "w", kind: "length", curve: made.group.members[0], value: 10 },
      { id: "r", kind: "radius", curve: circle.id, value: 4 },
    ],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: dimensionRectangle(sketch, made.group, "height", 9),
        })
      ).error,
      undefined,
    );
    assert.match(
      (
        await owner.call({
          kind: "edit",
          sketch: dimensionRectangle(sketch, made.group, "width", 11),
        })
      ).error ?? "",
      /Length is locked/,
    );
    assert.match(
      (
        await owner.call({
          kind: "edit",
          sketch: {
            ...sketch,
            constraints: [
              ...sketch.constraints,
              { id: "duplicate", kind: "radius", curve: circle.id, value: 4 },
            ],
          },
        })
      ).error ?? "",
      /already locked/,
    );
  } finally {
    owner.close();
  }
});
