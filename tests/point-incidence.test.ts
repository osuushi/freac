import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { curveDistance } from "../src/sketch/curve-geometry.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { actionIntent } from "../src/sketch/edit-intent.js";
import { segment } from "../src/sketch/geometry.js";
import { movePoint } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { makePointOnEdge } from "../src/sketch/point-incidence.js";
import { trimSketch } from "../src/sketch/trim-edit.js";
import { trimAt } from "../src/sketch/trim-geometry.js";

test("point/edge coincidence uses native equations, preserves initial reference and Undo", async () => {
  const line = segment({ x: -5, y: 0 }, { x: 5, y: 0 });
  const pointOwner = segment({ x: 0, y: 4 }, { x: 0, y: 8 });
  const arc = bowThrough(line, { x: 0, y: 2 });
  for (const edge of [
    line,
    {
      id: "circle",
      kind: "circle" as const,
      center: { x: 0, y: 0 },
      radius: 2,
      construction: false,
    },
    arc,
  ]) {
    for (const moveEdge of [false, true]) {
      const sketch: Sketch = { ...emptySketch(planes.XY), curves: [pointOwner, edge] };
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
        const changed = makePointOnEdge(
          sketch,
          { curve: pointOwner.id, end: "a" },
          edge.id,
          moveEdge,
        );
        assert.equal(
          (
            await owner.call({
              kind: "edit",
              sketch: changed,
              intent: actionIntent(
                {
                  kind: "pair",
                  subject: moveEdge ? edge.id : pointOwner.id,
                  reference: moveEdge ? pointOwner.id : edge.id,
                  points: moveEdge ? undefined : [{ curve: pointOwner.id, end: "a" }],
                },
                sketch,
                changed,
              ),
            })
          ).error,
          undefined,
        );
        const result = owner.view.data.sketches[0];
        assert.deepEqual(result.curves[moveEdge ? 0 : 1], sketch.curves[moveEdge ? 0 : 1]);
        const point = result.curves[0];
        assert.ok(point.kind === "segment");
        assert.ok(curveDistance(result.curves[1], point.a) < 1e-7);
        const next = movePoint(result, { curve: pointOwner.id, end: "a" }, { x: 1, y: 1 });
        const reply = await owner.call({ kind: "edit", sketch: next });
        assert.equal(reply.error, undefined);
        {
          const moved = owner.view.data.sketches[0];
          assert.ok(moved.curves[0].kind === "segment");
          assert.ok(curveDistance(moved.curves[1], moved.curves[0].a) < 1e-7);
          await owner.call({ kind: "undo" });
        }
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data.sketches[0], sketch);
      } finally {
        owner.close();
      }
    }
  }
});

test("point-on-edge permits a radius-locked arc endpoint to solve and rejects off-domain incidence", async () => {
  const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 4 });
  const edge = segment({ x: -3, y: 0 }, { x: -3, y: 6 });
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [arc, edge],
    constraints: [{ id: "radius", kind: "radius", curve: arc.id, value: 4 }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const changed = makePointOnEdge(sketch, { curve: arc.id, end: "a" }, edge.id);
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: changed,
          intent: {
            kind: "pair",
            subject: arc.id,
            reference: edge.id,
            targets: [{ curve: arc.id, end: "a" }],
          },
        })
      ).error,
      undefined,
    );
    const accepted = owner.view.data;
    const current = accepted.sketches[0];
    assert.ok(current.curves[0].kind === "arc");
    assert.ok(Math.abs(current.curves[0].a.x + 3) < 1e-7);
    const bad = {
      ...current,
      curves: current.curves.map((c) =>
        c.id === edge.id ? { ...edge, a: { x: -3, y: 10 }, b: { x: -3, y: 15 } } : c,
      ),
    };
    assert.ok((await owner.call({ kind: "edit", sketch: bad })).error);
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});

test("trimming an incidence edge remaps to the containing remnant and Undo restores its identity", async () => {
  const source = segment({ x: -10, y: 0 }, { x: 10, y: 0 });
  const point = segment({ x: 5, y: 0 }, { x: 5, y: 5 });
  const cuts = [
    segment({ x: -2, y: -5 }, { x: -2, y: 5 }),
    segment({ x: 2, y: -5 }, { x: 2, y: 5 }),
  ];
  const sketch = makePointOnEdge(
    { ...emptySketch(planes.XY), curves: [source, point, ...cuts] },
    { curve: point.id, end: "a" },
    source.id,
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const trimmed = trimSketch(sketch, trimAt(source, sketch.curves, { x: 0, y: 0 }));
    const c = trimmed.sketch.constraints.find((c) => c.kind === "point-on-edge");
    assert.ok(c?.kind === "point-on-edge");
    assert.notEqual(c.edge, source.id);
    assert.equal(c.id, sketch.constraints[0].id);
    assert.equal((await owner.call({ kind: "edit", sketch: trimmed.sketch })).error, undefined);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});
