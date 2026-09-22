import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle, bowThrough } from "../src/sketch/arc-geometry.js";
import { circleRadius } from "../src/sketch/circle-edit.js";
import { circularContact } from "../src/sketch/circular-tangency.js";
import { type Circle, emptySketch, newId } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { makeTangent } from "../src/sketch/tangency.js";

const circle = (x: number, radius: number): Circle => ({
  id: newId(),
  kind: "circle",
  center: { x, y: 0 },
  radius,
  construction: false,
});
test("circle pair tangency retains external/internal branches through radius edits and Undo", async () => {
  for (const internal of [false, true]) {
    const a = circle(internal ? 4 : 0, 2),
      b = circle(internal ? 0 : 10, internal ? 8 : 3);
    const original = { ...emptySketch(planes.XY), curves: [a, b] };
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
      assert.equal(
        (await owner.call({ kind: "edit", sketch: makeTangent(original, a, b) })).error,
        undefined,
      );
      const linked = owner.view.data.sketches[0];
      assert.deepEqual(linked.curves[1], b);
      const side = internal ? "b-contains-a" : "external";
      assert.equal(linked.constraints[0].kind === "tangent" && linked.constraints[0].side, side);
      assert.equal(
        (await owner.call({ kind: "edit", sketch: circleRadius(linked, a.id, 3) })).error,
        undefined,
      );
      const edited = owner.view.data.sketches[0];
      const ca = edited.curves[0] as Circle,
        cb = edited.curves[1] as Circle;
      circularContact(ca, cb, side);
      assert.equal(cb.radius, b.radius);
      assert.deepEqual(ca.center, (linked.curves[0] as Circle).center);
      if (internal) {
        assert.ok(
          (await owner.call({ kind: "edit", sketch: circleRadius(edited, a.id, 9) })).error,
        );
        assert.deepEqual(owner.view.data.sketches[0], edited);
      }
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], linked);
    } finally {
      owner.close();
    }
  }
});

test("a tangent arc follows its circle's radius without changing its own radius or sweep", async () => {
  const a = circle(0, 2);
  const b = bowThrough(segment({ x: 8, y: 0 }, { x: 16, y: 0 }), { x: 12, y: 8 });
  assert.equal(b.kind, "arc");
  if (b.kind !== "arc") return;
  const original = { ...emptySketch(planes.XY), curves: [a, b] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: makeTangent(original, a, b) })).error,
      undefined,
    );
    const linked = owner.view.data.sketches[0];
    assert.deepEqual(linked.curves[1], b);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: circleRadius(linked, a.id, 3) })).error,
      undefined,
    );
    const peer = owner.view.data.sketches[0].curves[1];
    assert.equal(peer.kind, "arc");
    if (peer.kind !== "arc") return;
    assert.ok(Math.abs(peer.bulge - b.bulge) < 1e-7);
    assert.ok(Math.abs(arcCircle(peer).radius - arcCircle(b).radius) < 1e-7);
  } finally {
    owner.close();
  }
});

test("arc-domain boundaries supply the nearest visible contact when the center direction misses", async () => {
  const a = bowThrough(segment({ x: 3, y: 4 }, { x: 4, y: 3 }), {
    x: Math.sqrt(12.5),
    y: Math.sqrt(12.5),
  });
  assert.equal(a.kind, "arc");
  if (a.kind !== "arc") return;
  const b = circle(10, 1);
  const original = { ...emptySketch(planes.XY), curves: [a, b] };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
    assert.equal(
      (await owner.call({ kind: "edit", sketch: makeTangent(original, a, b) })).error,
      undefined,
    );
    const result = owner.view.data.sketches[0];
    assert.deepEqual(result.curves[1], b);
    const arc = result.curves[0];
    assert.equal(arc.kind, "arc");
    if (arc.kind !== "arc") return;
    circularContact(arc, b, "external");
    assert.ok(Math.abs(arcCircle(arc).center.x - 5.2) < 1e-7);
    assert.ok(Math.abs(arcCircle(arc).center.y + 3.6) < 1e-7);
  } finally {
    owner.close();
  }
});
