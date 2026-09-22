import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { actionIntent } from "../src/sketch/edit-intent.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { dimensionRectangle, resizeRectangle } from "../src/sketch/rectangle-edit.js";

test("rectangle drag/numeric anchors are independent of disconnected constraints", async () => {
  const { sketch, group } = rectangle(emptySketch(planes.XY), { x: 3, y: 7 }, { x: 23, y: 17 });
  const peer = segment({ x: 60, y: 50 }, { x: 70, y: 50 });
  for (const numeric of [false, true]) {
    const results = [];
    for (const extra of [false, true]) {
      const original = {
        ...sketch,
        curves: extra ? [...sketch.curves, peer] : sketch.curves,
        constraints: extra
          ? [...sketch.constraints, { id: "external", kind: "horizontal" as const, a: peer.id }]
          : sketch.constraints,
      };
      const changed = numeric
        ? dimensionRectangle(original, group, "width", 34, { kind: "edge", index: 3 })
        : resizeRectangle(original, group, { kind: "edge", index: 3 }, { x: -11, y: 12 });
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch: original })).error, undefined);
        assert.equal(
          (
            await owner.call({
              kind: "preview",
              sketch: changed,
              intent: actionIntent({ kind: "dimension" }, original, changed),
            })
          ).error,
          undefined,
        );
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const solved = owner.view.data.sketches[0];
        results.push(solved.curves.slice(0, 4));
        assert.equal(solved.curves[0].kind, "segment");
        if (solved.curves[0].kind === "segment") {
          assert.ok(Math.abs(solved.curves[0].a.x + 11) < 1e-7);
          assert.ok(Math.abs(solved.curves[0].b.x - 23) < 1e-7);
        }
        if (extra) assert.deepEqual(solved.curves[4], peer);
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data.sketches[0], original);
      } finally {
        owner.close();
      }
    }
    assert.deepEqual(results[0], results[1]);
  }
});
