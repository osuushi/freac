import assert from "node:assert/strict";
import test from "node:test";
import { bowThrough } from "../src/sketch/arc-geometry.js";
import { drawingAttachment } from "../src/sketch/creation-links.js";
import { type Curve, emptySketch, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";

const sketch = (curves: Curve[]): Sketch => ({ ...emptySketch(planes.XY), curves });
test("drawing attachment distinguishes endpoints, finite edges and non-edge centers", () => {
  const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 });
  const arc = bowThrough(line, { x: 0, y: 4 });
  for (const curve of [line, arc]) {
    assert.deepEqual(drawingAttachment(sketch([curve]), curve.a), {
      kind: "coincident",
      peer: { curve: curve.id, end: "a" },
    });
    assert.deepEqual(drawingAttachment(sketch([curve]), curve.b), {
      kind: "coincident",
      peer: { curve: curve.id, end: "b" },
    });
  }
  assert.deepEqual(drawingAttachment(sketch([line]), { x: 0, y: 0 }), {
    kind: "point-on-edge",
    edge: line.id,
  });
  assert.deepEqual(drawingAttachment(sketch([arc]), { x: 0, y: 4 }), {
    kind: "point-on-edge",
    edge: arc.id,
  });
  assert.equal(drawingAttachment(sketch([arc]), { x: 0, y: 0 }), null);
  assert.equal(drawingAttachment(sketch([arc]), { x: 0, y: -4 }), null);
  const circle: Curve = {
    kind: "circle",
    id: "circle",
    center: { x: 0, y: 0 },
    radius: 4,
    construction: false,
  };
  assert.deepEqual(drawingAttachment(sketch([circle]), { x: 4, y: 0 }), {
    kind: "point-on-edge",
    edge: circle.id,
  });
  assert.equal(drawingAttachment(sketch([circle]), circle.center), null);
});
test("drawing attachment refuses multipoints, T-junctions and ambiguous intersections", () => {
  const line = segment({ x: -4, y: 0 }, { x: 4, y: 0 });
  const peer = segment({ x: 4, y: 0 }, { x: 8, y: 2 });
  assert.equal(drawingAttachment(sketch([line, peer]), peer.a), null);
  const cross = segment({ x: 4, y: -4 }, { x: 4, y: 4 });
  assert.equal(drawingAttachment(sketch([line, cross]), { x: 4, y: 0 }), null);
  const middle = segment({ x: 0, y: -4 }, { x: 0, y: 4 });
  assert.equal(drawingAttachment(sketch([line, middle]), { x: 0, y: 0 }), null);
  assert.equal(drawingAttachment(sketch([line]), { x: 5, y: 0 }), null);
});
