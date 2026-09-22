import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { editBezierHandle } from "../src/sketch/bezier-edit.js";
import { emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { makeTangent } from "../src/sketch/tangency.js";

test("cubic tangent aligns its endpoint handle and retains the relationship through edits", async () => {
  const cubic = {
    id: "cubic",
    kind: "bezier" as const,
    a: { x: -10, y: 0 },
    c1: { x: -7, y: 0 },
    c2: { x: -2, y: 3 },
    b: { x: 0, y: 0 },
    construction: false,
  };
  const line = { ...segment({ x: 0, y: 0 }, { x: 8, y: 0 }), id: "line" };
  const source = { ...emptySketch(planes.XY), curves: [cubic, line] };
  const tangent = makeTangent(source, cubic, line);
  assert.equal(tangent.constraints[0].kind, "tangent");
  assert.equal(tangent.constraints[0].junction?.aEnd, "b");
  assert.equal(tangent.constraints[0].junction?.bEnd, "a");
  assert.equal(tangent.curves[0].kind, "bezier");
  if (tangent.curves[0].kind !== "bezier") return;
  assert.ok(Math.abs(tangent.curves[0].c2.y) < 1e-7);

  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: tangent })).error, undefined);
    const accepted = owner.view.data.sketches[0];
    const changed = editBezierHandle(accepted, cubic.id, "c2", { x: -2, y: 5 });
    assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
    const result = owner.view.data.sketches[0].curves[0];
    assert.equal(result.kind, "bezier");
    if (result.kind !== "bezier") return;
    assert.ok(Math.abs(result.c2.y) < 1e-7);
    assert.ok(Math.abs(Math.hypot(result.c2.x, result.c2.y) - Math.sqrt(29)) < 1e-7);
  } finally {
    owner.close();
  }
});

test("cubic-to-cubic tangency keeps either dragged control handle", async () => {
  const first = {
    id: "first",
    kind: "bezier" as const,
    a: { x: -10, y: 0 },
    c1: { x: -7, y: 0 },
    c2: { x: -2, y: 3 },
    b: { x: 0, y: 0 },
    construction: false,
  };
  const second = {
    id: "second",
    kind: "bezier" as const,
    a: { x: 0, y: 0 },
    c1: { x: 3, y: 2 },
    c2: { x: 7, y: 0 },
    b: { x: 10, y: 0 },
    construction: false,
  };
  const source = { ...emptySketch(planes.XY), curves: [first, second] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: makeTangent(source, first, second) })).error,
      undefined,
    );
    const accepted = owner.view.data.sketches[0];
    const changed = editBezierHandle(accepted, second.id, "c1", { x: 4, y: 5 });
    assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
    const [a, b] = owner.view.data.sketches[0].curves;
    assert.equal(a.kind, "bezier");
    assert.equal(b.kind, "bezier");
    if (a.kind !== "bezier" || b.kind !== "bezier") return;
    assert.deepEqual(b.c1, { x: 4, y: 5 });
    const firstDirection = { x: a.c2.x - a.b.x, y: a.c2.y - a.b.y };
    const secondDirection = { x: b.c1.x - b.a.x, y: b.c1.y - b.a.y };
    assert.ok(
      Math.abs(firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x) < 1e-7,
    );
    assert.ok(firstDirection.x * secondDirection.x + firstDirection.y * secondDirection.y < 0);
    const changedAgain = editBezierHandle(owner.view.data.sketches[0], first.id, "c2", {
      x: -3,
      y: -4,
    });
    assert.equal((await owner.call({ kind: "edit", sketch: changedAgain })).error, undefined);
    const [againA, againB] = owner.view.data.sketches[0].curves;
    assert.equal(againA.kind, "bezier");
    assert.equal(againB.kind, "bezier");
    if (againA.kind !== "bezier" || againB.kind !== "bezier") return;
    assert.deepEqual(againA.c2, { x: -3, y: -4 });
    assert.notDeepEqual(againB.c1, b.c1);
    const againFirstDirection = { x: againA.c2.x - againA.b.x, y: againA.c2.y - againA.b.y };
    const againSecondDirection = { x: againB.c1.x - againB.a.x, y: againB.c1.y - againB.a.y };
    assert.ok(
      Math.abs(
        againFirstDirection.x * againSecondDirection.y -
          againFirstDirection.y * againSecondDirection.x,
      ) < 1e-7,
    );
    assert.ok(
      againFirstDirection.x * againSecondDirection.x +
        againFirstDirection.y * againSecondDirection.y <
        0,
    );
  } finally {
    owner.close();
  }
});

test("cubic tangency follows an arc endpoint direction", async () => {
  const cubic = {
    id: "cubic",
    kind: "bezier" as const,
    a: { x: -10, y: 0 },
    c1: { x: -7, y: 0 },
    c2: { x: -2, y: 3 },
    b: { x: 0, y: 0 },
    construction: false,
  };
  const arc = bowThrough({ ...segment({ x: 0, y: 0 }, { x: 8, y: 0 }), id: "arc" }, { x: 4, y: 4 });
  const source = { ...emptySketch(planes.XY), curves: [cubic, arc] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: makeTangent(source, cubic, arc) })).error,
      undefined,
    );
  } finally {
    owner.close();
  }
});
