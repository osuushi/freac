import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { NativeSolver } from "../src/backend/native-solver.js";
import { solverInput } from "../src/backend/solver-input.js";
import { checkResiduals } from "../src/backend/solver-residuals.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { dimensionRectangle } from "../src/sketch/rectangle-edit.js";

const shape = () => rectangle(emptySketch(planes.XY), { x: 3, y: 7 }, { x: 23, y: 17 });

test("PlaneGCS computes changed extents from old coordinates, with independent residual checks", async () => {
  const solver = new NativeSolver();
  try {
    const { sketch, group } = shape();
    const target = dimensionRectangle(sketch, group, "width", 34, { kind: "edge", index: 3 });
    const input = solverInput(target, sketch);
    assert.equal(
      Math.hypot(input.points[1].x - input.points[0].x, input.points[1].y - input.points[0].y),
      20,
    );
    const { points: solved } = await solver.solve(input);
    checkResiduals(input, solved);
    assert.ok(Math.abs(solved[0].x + 11) < 1e-7);
    assert.ok(Math.abs(solved[1].x - 23) < 1e-7);
    assert.ok(Math.abs(solved[4].y - 17) < 1e-7);
    assert.throws(() => checkResiduals(input, input.points), /does not satisfy/);
  } finally {
    solver.close();
  }
});

test("backend preview, discard, final acceptance, conflict rejection and Undo own one document", async () => {
  const owner = new DocumentOwner();
  try {
    const { sketch, group } = shape();
    const creation = await owner.call({ kind: "preview", sketch });
    assert.equal(creation.error, undefined);
    assert.equal(creation.view.data.sketches.length, 0);
    assert.equal(creation.view.canUndo, false);
    await owner.call({ kind: "discard" });
    assert.equal((await owner.call({ kind: "accept" })).error, "No valid edit to accept");
    await owner.call({ kind: "edit", sketch });
    const original = structuredClone(owner.view.data);
    const bigger = dimensionRectangle(original.sketches[0], group, "width", 40);
    await owner.call({ kind: "edit", sketch: bigger });
    const enlarged = structuredClone(owner.view.data);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    const conflict: Sketch = {
      ...bigger,
      constraints: [
        ...bigger.constraints,
        { id: "impossible", kind: "parallel", a: group.members[0], b: group.members[1] },
      ],
    };
    const rejected = await owner.call({ kind: "edit", sketch: conflict });
    assert.match(rejected.error ?? "", /Conflicting/);
    assert.deepEqual(owner.view.data, original);
    assert.equal(owner.view.canRedo, true);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, enlarged);
    assert.ok(owner.view.solveCount >= 3);
  } finally {
    owner.close();
  }
});

test("backend rejects concurrent edits and survives an explicitly restarted calculator", async () => {
  const solver = new NativeSolver(),
    owner = new DocumentOwner(solver);
  try {
    const { sketch } = shape();
    const pending = owner.call({ kind: "edit", sketch });
    assert.match(
      (await owner.call({ kind: "clear", sketchId: sketch.id })).error ?? "",
      /current edit/,
    );
    solver.close();
    assert.ok((await pending).error);
    assert.equal(owner.view.data.sketches.length, 0);
    assert.equal(owner.view.canUndo, false);
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(owner.view.data.sketches.length, 1);
  } finally {
    owner.close();
  }
});
