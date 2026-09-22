import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { radiusEdit } from "../src/sketch/arc-edit.js";
import { arcCircle, bowRadius, bowThrough } from "../src/sketch/arc-geometry.js";
import { emptySketch, newId } from "../src/sketch/document.js";
import { changedTargets } from "../src/sketch/edit-intent.js";
import { distance, segment } from "../src/sketch/geometry.js";
import { movePoint } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints } from "../src/sketch/point-links.js";
import { makeTangent } from "../src/sketch/tangency.js";

test("joined segments become tangent without fusing their endpoints", async () => {
  const first = { ...segment({ x: -10, y: 0 }, { x: 0, y: 0 }), id: "first" };
  const second = { ...segment({ x: 0, y: 0 }, { x: 10, y: 4 }), id: "second" };
  const source = { ...emptySketch(planes.XY), curves: [first, second] };
  const target = makeTangent(source, first, second);
  assert.equal(
    target.constraints.filter((constraint) => constraint.kind === "coincident").length,
    0,
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: source })).error, undefined);
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    const [a, b] = owner.view.data.sketches[0].curves;
    assert.equal(a.kind, "segment");
    assert.equal(b.kind, "segment");
    if (a.kind !== "segment" || b.kind !== "segment") return;
    assert.deepEqual(b, second);
    assert.deepEqual(a.b, b.a);
    const firstDirection = { x: a.a.x - a.b.x, y: a.a.y - a.b.y };
    const secondDirection = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
    assert.ok(
      Math.abs(firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x) < 1e-7,
    );
    assert.ok(firstDirection.x * secondDirection.x + firstDirection.y * secondDirection.y < 0);
  } finally {
    owner.close();
  }
});

test("joined tangent rotates first selection, with explicit links or no implicit fusion", async () => {
  for (const fused of [false, true])
    for (const lineFirst of [false, true]) {
      const arc = bowThrough(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), { x: 0, y: 4 });
      assert.equal(arc.kind, "arc");
      if (arc.kind !== "arc") return;
      const line = segment({ x: 4, y: 0 }, { x: 8, y: 3 });
      let original = { ...emptySketch(planes.XY), curves: [arc, line] };
      if (fused)
        original = fusePoints(original, [
          { curve: arc.id, end: "b" },
          { curve: line.id, end: "a" },
        ]) as typeof original;
      const target = makeTangent(original, lineFirst ? line : arc, lineFirst ? arc : line);
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
        assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
        const linked = owner.view.data.sketches[0];
        assert.deepEqual(linked.curves[lineFirst ? 0 : 1], lineFirst ? arc : line);
        assert.equal(
          linked.constraints.filter((c) => c.kind === "coincident").length,
          fused ? 1 : 0,
        );
        const result = linked.curves[1];
        assert.equal(result.kind, "segment");
        if (result.kind !== "segment") return;
        assert.ok(Math.abs(distance(result.a, result.b) - 5) < 1e-7);
        if (lineFirst) {
          assert.ok(distance(result.b, { x: 4, y: 5 }) < 1e-7);
          assert.equal(
            (await owner.call({ kind: "edit", sketch: radiusEdit(linked, arc, 5, 1) })).error,
            undefined,
          );
          const peer = owner.view.data.sketches[0].curves[1];
          assert.equal(peer.kind, "segment");
          if (peer.kind !== "segment") return;
          assert.ok(
            Math.abs(distance(peer.a, peer.b) - 5) < 1e-7,
            "Radius edits preserve peer line length",
          );
        }
        await owner.call({ kind: "undo" });
      } finally {
        owner.close();
      }
    }
});

test("two joined arcs align in both selection orders while keeping radius locks and Undo", async () => {
  for (const reverse of [false, true]) {
    const a = bowRadius(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), 4, 1);
    const b = bowRadius(segment({ x: 4, y: 0 }, { x: 8, y: 3 }), 3, 1);
    const linked = fusePoints({ ...emptySketch(planes.XY), curves: [a, b] }, [
      { curve: a.id, end: "b" },
      { curve: b.id, end: "a" },
    ]);
    const original = {
      ...linked,
      constraints: [
        ...linked.constraints,
        { id: newId(), kind: "radius" as const, curve: a.id, value: 4 },
        { id: newId(), kind: "radius" as const, curve: b.id, value: 3 },
      ],
    };
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      assert.equal(
        (
          await owner.call({
            kind: "edit",
            sketch: makeTangent(original, reverse ? b : a, reverse ? a : b),
          })
        ).error,
        undefined,
      );
      const result = owner.view.data.sketches[0];
      assert.deepEqual(result.curves[reverse ? 0 : 1], reverse ? a : b);
      for (const [i, curve] of result.curves.entries()) {
        assert.equal(curve.kind, "arc");
        if (curve.kind !== "arc") return;
        assert.ok(Math.abs(arcCircle(curve).radius - (i === 0 ? 4 : 3)) < 1e-7);
      }
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], original);
    } finally {
      owner.close();
    }
  }
});

test("point drag intent allows constrained projection despite accidental length preservation", async () => {
  const arc = bowRadius(segment({ x: -4, y: 0 }, { x: 4, y: 0 }), 5, 1);
  const line = segment({ x: 4, y: 0 }, { x: 8, y: 3 });
  const original = fusePoints(
    {
      ...emptySketch(planes.XY),
      curves: [arc, line],
      constraints: [{ id: newId(), kind: "radius", curve: arc.id, value: 5 }],
    },
    [
      { curve: arc.id, end: "b" },
      { curve: line.id, end: "a" },
    ],
  );
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: makeTangent(original, line, arc) })).error,
      undefined,
    );
    const before = owner.view.data;
    const target = movePoint(before.sketches[0], { curve: arc.id, end: "b" }, { x: 5, y: 1 });
    assert.ok(
      (
        await owner.call({
          kind: "preview",
          sketch: target,
          intent: { kind: "transform", targets: changedTargets(before.sketches[0], target) },
        })
      ).error,
      "Rigid intent must not deform",
    );
    assert.equal(
      (
        await owner.call({
          kind: "preview",
          sketch: target,
          intent: {
            kind: "point",
            targets: [
              { curve: arc.id, end: "b" },
              { curve: line.id, end: "a" },
            ],
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const result = owner.view.data.sketches[0].curves[0];
    assert.equal(result.kind, "arc");
    if (result.kind !== "arc") return;
    assert.ok(distance(result.b, arc.b) > 0.1);
    assert.ok(Math.abs(arcCircle(result).radius - 5) < 1e-7);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
