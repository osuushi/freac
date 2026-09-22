import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { editCorner, measuredAngle, meetingAngle } from "../src/sketch/corner-angle.js";
import { emptySketch, type Segment } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { lineDimension } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { fusePoints } from "../src/sketch/point-links.js";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("meeting ray angles ignore segment endpoint order and keep the reference fixed", async () => {
  for (const reverseA of [false, true])
    for (const reverseB of [false, true]) {
      const origin = { x: 0, y: 0 },
        up = { x: 0, y: 10 },
        right = { x: 10, y: 0 };
      const a = segment(reverseA ? up : origin, reverseA ? origin : up),
        b = segment(reverseB ? right : origin, reverseB ? origin : right);
      const corner = meetingAngle(a, b);
      assert.ok(corner);
      near(Math.abs(corner.value), 90);
      const original = fusePoints({ ...emptySketch(planes.XY), curves: [b, a] }, [
        { curve: a.id, end: corner.aEnd },
        { curve: b.id, end: corner.bEnd },
      ]);
      const oneTime = editCorner(original, corner, 60);
      assert.equal(oneTime.constraints.length, 1);
      const locked = {
        ...oneTime,
        constraints: [...oneTime.constraints, { ...corner, id: "angle", value: -60 }],
      };
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
        assert.equal((await owner.call({ kind: "edit", sketch: locked })).error, undefined);
        assert.deepEqual(owner.view.data.sketches[0].curves[0], b);
        near(Math.abs(measuredAngle(owner.view.data.sketches[0], corner)), 60);
        const currentCorner = meetingAngle(locked.curves[1] as Segment, b);
        assert.ok(currentCorner);
        const changed = editCorner(locked, currentCorner, 30);
        assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
        near(Math.abs(measuredAngle(owner.view.data.sketches[0], corner)), 30);
        await owner.call({ kind: "undo" });
        near(Math.abs(measuredAngle(owner.view.data.sketches[0], corner)), 60);
      } finally {
        owner.close();
      }
    }
});
test("locked meeting angle follows later editing of the reference edge", async () => {
  const a = segment({ x: 0, y: 0 }, { x: 0, y: 10 }),
    b = segment({ x: 0, y: 0 }, { x: 10, y: 0 });
  const corner = meetingAngle(a, b);
  assert.ok(corner);
  const original = { ...emptySketch(planes.XY), curves: [a, b] };
  const locked = {
    ...original,
    constraints: [...original.constraints, { ...corner, id: "angle" }],
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch: locked })).error, undefined);
    const target = lineDimension(locked, b.id, "angle", 30);
    assert.equal((await owner.call({ kind: "edit", sketch: target })).error, undefined);
    near(measuredAngle(owner.view.data.sketches[0], corner), -90);
    assert.equal(owner.view.data.sketches[0].constraints.length, 1, "Angle adds no coincidence");
    for (const curve of owner.view.data.sketches[0].curves)
      if (curve.kind === "segment") assert.deepEqual(curve.a, { x: 0, y: 0 });
    const result = owner.view.data.sketches[0].curves[1] as Segment;
    near((Math.atan2(result.b.y, result.b.x) * 180) / Math.PI, 30);
  } finally {
    owner.close();
  }
});
