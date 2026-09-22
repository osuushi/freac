import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { type Endpoint, emptySketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { coincidentPoints, movePoint } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints, unfusePoints } from "../src/sketch/point-links.js";

test("unfusing the junction hub preserves links among unselected points", async () => {
  const curves = [
    segment({ x: 0, y: 0 }, { x: 10, y: 0 }),
    segment({ x: 0, y: 0 }, { x: 0, y: 10 }),
    segment({ x: 0, y: 0 }, { x: -10, y: 0 }),
  ];
  const points: Endpoint[] = curves.map((c) => ({ curve: c.id, end: "a" }));
  const original = { ...emptySketch(planes.XY), curves };
  const fused = fusePoints(original, points);
  assert.equal(fused.constraints.length, 2);
  assert.deepEqual(
    fusePoints(fused, points),
    fused,
    "Repeated Fuse does not add redundant equations",
  );
  const split = unfusePoints(fused, [points[0]]);
  assert.equal(coincidentPoints(split, points[0]).length, 1);
  assert.equal(coincidentPoints(split, points[1]).length, 2);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: fused })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: movePoint(fused, points[0], { x: 2, y: 3 }) }))
        .error,
      undefined,
    );
    for (const curve of owner.view.data.sketches[0].curves) {
      assert.equal(curve.kind, "segment");
      assert.deepEqual(curve.a, { x: 2, y: 3 });
    }
    const duplicate = {
      ...fused,
      constraints: [
        ...fused.constraints,
        { id: "cycle", kind: "coincident" as const, a: points[1], b: points[2] },
      ],
    };
    assert.match(
      (await owner.call({ kind: "edit", sketch: duplicate })).error ?? "",
      /[Rr]edundant/,
    );
    await owner.call({ kind: "undo" });
    assert.equal((await owner.call({ kind: "edit", sketch: split })).error, undefined);
    const moved = movePoint(split, points[0], { x: 2, y: 3 });
    assert.equal((await owner.call({ kind: "edit", sketch: moved })).error, undefined);
    const other = owner.view.data.sketches[0].curves[1];
    if (other.kind !== "circle") assert.deepEqual(other.a, { x: 0, y: 0 });
  } finally {
    owner.close();
  }
});

test("circle centers link to endpoints through native solving and detach without radius changes", async () => {
  const line = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  const circle = {
    id: "circle",
    kind: "circle" as const,
    center: { x: 0, y: 0 },
    radius: 4,
    construction: false,
  };
  const endpoint = { curve: line.id, end: "a" as const };
  const center = { curve: circle.id, end: "center" as const };
  const linked = fusePoints({ ...emptySketch(planes.XY), curves: [circle, line] }, [
    endpoint,
    center,
  ]);
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: linked })).error, undefined);
    // Only supply the line target: the native calculator must move the linked center.
    const target = { ...linked, curves: [circle, { ...line, a: { x: 2, y: 3 } }] };
    assert.equal((await owner.call({ kind: "preview", sketch: target })).error, undefined);
    const solved = owner.view.candidate?.sketches[0].curves[0];
    assert.equal(solved?.kind, "circle");
    if (solved?.kind === "circle") {
      assert.ok(Math.hypot(solved.center.x - 2, solved.center.y - 3) < 1e-7);
      assert.equal(solved.radius, 4);
    }
    await owner.call({ kind: "discard" });
    const secondCircle = { ...circle, id: "second-circle", radius: 7 };
    const circles = fusePoints(
      {
        ...emptySketch(planes.XZ),
        curves: [circle, secondCircle],
        constraints: [{ id: "radius-lock", kind: "radius", curve: circle.id, value: 4 }],
      },
      [center, { curve: secondCircle.id, end: "center" }],
    );
    assert.equal((await owner.call({ kind: "edit", sketch: circles })).error, undefined);
    const shifted = movePoint(circles, center, { x: -3, y: 2 });
    assert.equal((await owner.call({ kind: "edit", sketch: shifted })).error, undefined);
    const result = owner.view.data.sketches.find((s) => s.id === circles.id);
    for (const curve of result?.curves ?? []) {
      assert.equal(curve.kind, "circle");
      if (curve.kind === "circle") {
        assert.deepEqual(curve.center, { x: -3, y: 2 });
        assert.equal(curve.radius, curve.id === circle.id ? 4 : 7);
      }
    }
    const detached = unfusePoints(linked, [center]);
    assert.equal(detached.constraints.length, 0);
    assert.deepEqual(detached.curves, linked.curves);
  } finally {
    owner.close();
  }
});
