import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { replaceBow } from "../src/sketch/arc-edit.js";
import { arcCircle, bowRadius, bowThrough } from "../src/sketch/arc-geometry.js";
import { type Arc, emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { movePoint } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints, unfusePoints } from "../src/sketch/point-links.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("linked arc endpoint drag solves radius lock without fixing its derived center", async () => {
  const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 4 }) as Arc;
  const line = segment(arc.a, { x: -8, y: 0 });
  const endpoint = { curve: arc.id, end: "a" as const };
  const linked = fusePoints(
    {
      ...emptySketch(planes.XY),
      curves: [arc, line],
      constraints: [{ id: "r", kind: "radius", curve: arc.id, value: 4 }],
    },
    [endpoint, { curve: line.id, end: "a" }],
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: linked })).error, undefined);
    const target = movePoint(linked, endpoint, { x: -3, y: 1 });
    assert.equal((await owner.call({ kind: "preview", sketch: target })).error, undefined);
    const solved = owner.view.candidate?.sketches[0];
    assert.ok(solved);
    const result = solved.curves[0] as Arc;
    near(result.a.x, -3);
    near(result.a.y, 1);
    near(result.b.x, 4);
    near(result.b.y, 0);
    near(arcCircle(result).radius, 4);
    assert.equal(Math.sign(result.bulge), Math.sign(arc.bulge));
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], linked);
  } finally {
    owner.close();
  }
});

test("arc centers fuse, translate without changing branch and unfuse without moving", async () => {
  const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 8 }) as Arc;
  const center = arcCircle(arc).center;
  const line = segment(center, { x: 10, y: 10 });
  const ref = { curve: arc.id, end: "center" as const };
  const linked = fusePoints({ ...emptySketch(planes.XZ), curves: [line, arc] }, [
    ref,
    { curve: line.id, end: "a" },
  ]);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: linked })).error, undefined);
    const moved = movePoint(linked, ref, { x: center.x + 2, y: center.y + 3 });
    assert.equal((await owner.call({ kind: "edit", sketch: moved })).error, undefined);
    const result = owner.view.data.sketches[0].curves[1] as Arc;
    near(result.bulge, arc.bulge);
    near(result.a.x, arc.a.x + 2);
    near(result.b.y, arc.b.y + 3);
    const detached = unfusePoints(owner.view.data.sketches[0], [ref]);
    assert.equal(detached.constraints.length, 0);
    assert.deepEqual(detached.curves, owner.view.data.sketches[0].curves);
  } finally {
    owner.close();
  }
});

test("linked major arc radius edits retain fixed endpoints and branch through a semicircle", async () => {
  let arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 8 }) as Arc;
  const line = segment(arc.a, { x: -10, y: 0 });
  let sketch = fusePoints(
    {
      ...emptySketch(planes.XY),
      curves: [arc, line],
      constraints: [{ id: "r", kind: "radius", curve: arc.id, value: 5 }],
    },
    [
      { curve: arc.id, end: "a" },
      { curve: line.id, end: "a" },
    ],
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    for (const radius of [4, 6]) {
      arc = bowRadius(arc, radius, 1);
      sketch = {
        ...sketch,
        curves: [arc, line],
        constraints: sketch.constraints.map((c) =>
          c.kind === "radius" ? { ...c, value: radius } : c,
        ),
      };
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
      const result = owner.view.data.sketches[0].curves[0] as Arc;
      near(arcCircle(result).radius, radius);
      assert.deepEqual(result.a, arc.a);
      assert.deepEqual(result.b, arc.b);
      if (radius === 6) assert.ok(Math.abs(result.bulge) > 1);
    }
  } finally {
    owner.close();
  }
});

test("bowing a linked line preserves its endpoint constraint and identity", async () => {
  const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 });
  const other = segment(line.a, { x: -10, y: 5 });
  const sketch = fusePoints({ ...emptySketch(planes.XY), curves: [line, other] }, [
    { curve: line.id, end: "a" },
    { curve: other.id, end: "a" },
  ]);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const bowed = replaceBow(sketch, bowThrough(line, { x: 0, y: 2 }));
    assert.equal((await owner.call({ kind: "edit", sketch: bowed })).error, undefined);
    const result = owner.view.data.sketches[0];
    assert.equal(result.curves[0].kind, "arc");
    assert.equal(result.curves[0].id, line.id);
    assert.deepEqual(result.constraints, sketch.constraints);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.sketches[0], sketch);
  } finally {
    owner.close();
  }
});
