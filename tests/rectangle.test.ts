import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch, validateSketch, withSketch } from "../src/sketch/document.js";
import { rectangle, transform } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import {
  dimensionRectangle,
  rectangleFrame,
  resizeRectangle,
} from "../src/sketch/rectangle-edit.js";

test("all corner edits preserve the opposite anchor after a 37 degree rotation", () => {
  const angle = (37 * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const base = rectangle(emptySketch(planes.YZ), { x: 3, y: 7 }, { x: 23, y: 17 });
  const rotated = transform(base.sketch, new Set(base.group.members), (p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
  for (let index = 0; index < 4; index++) {
    const before = rectangleFrame(rotated, base.group),
      corner = before.corners[index];
    const target = { x: corner.x + 3, y: corner.y - 2 };
    const changed = resizeRectangle(rotated, base.group, { kind: "corner", index }, target);
    validateSketch(changed);
    const after = rectangleFrame(changed, base.group);
    assert.ok(
      Math.hypot(after.corners[index].x - target.x, after.corners[index].y - target.y) < 1e-10,
    );
    const opposite = (index + 2) % 4;
    assert.ok(
      Math.hypot(
        after.corners[opposite].x - before.corners[opposite].x,
        after.corners[opposite].y - before.corners[opposite].y,
      ) < 1e-10,
    );
  }
});
test("numeric width uses the selected left edge's right anchor, or the center without a handle", () => {
  const base = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 10 });
  const left = dimensionRectangle(base.sketch, base.group, "width", 30, { kind: "edge", index: 3 });
  assert.deepEqual(rectangleFrame(left, base.group).corners, [
    { x: -10, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: -10, y: 10 },
  ]);
  const centered = dimensionRectangle(base.sketch, base.group, "width", 30);
  assert.deepEqual(rectangleFrame(centered, base.group).center, { x: 10, y: 5 });
});
test("invalid collapse changes neither accepted geometry nor the redo branch", () => {
  const store = new DocumentStore();
  const base = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 10 });
  store.accept(withSketch(store.data, base.sketch));
  const enlarged = dimensionRectangle(base.sketch, base.group, "height", 15);
  store.accept(withSketch(store.data, enlarged));
  store.undo();
  const before = store.data;
  const collapsed = resizeRectangle(
    base.sketch,
    base.group,
    { kind: "edge", index: 3 },
    { x: 20, y: 5 },
  );
  assert.throws(() => store.accept(withSketch(store.data, collapsed)), /non-zero/);
  assert.equal(store.data, before);
  assert.equal(store.canRedo, true);
  store.redo();
  assert.equal(rectangleFrame(store.data.sketches[0], base.group).height, 15);
});

test("symmetric rectangle side and corner edits hold the center in rotated local frames", () => {
  const base = rectangle(emptySketch(planes.YZ), { x: 2, y: 4 }, { x: 22, y: 14 });
  const angle = 0.63;
  const rotated = transform(base.sketch, new Set(base.group.members), (p) => ({
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }));
  const before = rectangleFrame(rotated, base.group);
  for (const kind of ["edge", "corner"] as const) {
    for (let index = 0; index < 4; index++) {
      const corner = before.corners[index];
      const changed = resizeRectangle(
        rotated,
        base.group,
        { kind, index },
        {
          x: corner.x + 3,
          y: corner.y - 2,
        },
        true,
      );
      validateSketch(changed);
      const after = rectangleFrame(changed, base.group);
      assert.ok(
        Math.hypot(after.center.x - before.center.x, after.center.y - before.center.y) < 1e-10,
      );
      if (kind === "edge")
        assert.ok(
          Math.abs(index % 2 ? after.height - before.height : after.width - before.width) < 1e-10,
        );
      else {
        assert.ok(Math.abs(after.corners[index].x - corner.x - 3) < 1e-10);
        assert.ok(Math.abs(after.corners[index].y - corner.y + 2) < 1e-10);
      }
    }
  }
});
