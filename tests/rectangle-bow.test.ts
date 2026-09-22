import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { bowRadius } from "../src/sketch/arc-geometry.js";
import { emptySketch, newId } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { bowRectangleSide } from "../src/sketch/rectangle-bow.js";

test("bowing any rectangle side preserves endpoints and remaining right angles with atomic Undo", async () => {
  for (const plane of Object.values(planes))
    for (let i = 0; i < 4; i++) {
      const { sketch } = rectangle(emptySketch(plane), { x: -10, y: -5 }, { x: 10, y: 5 });
      const side = sketch.curves[i];
      assert.ok(side.kind === "segment");
      const locked = {
        ...sketch,
        constraints: [
          ...sketch.constraints,
          { id: newId(), kind: "length" as const, curve: side.id, value: i % 2 ? 10 : 20 },
        ],
      };
      const result = bowRectangleSide(locked, bowRadius(side, 15, 1));
      assert.deepEqual(result.removed.map((c) => c.kind).sort(), ["length", "parallel"]);
      assert.equal(result.sketch.groups.length, 0);
      assert.equal(result.sketch.constraints.filter((c) => c.kind === "coincident").length, 4);
      assert.equal(result.sketch.constraints.filter((c) => c.kind === "parallel").length, 1);
      assert.equal(result.sketch.constraints.filter((c) => c.kind === "perpendicular").length, 1);
      const owner = new DocumentOwner();
      try {
        assert.equal((await owner.call({ kind: "edit", sketch: locked })).error, undefined);
        const before = owner.view.data.sketches[0];
        assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
        const accepted = owner.view.data.sketches[0];
        for (let n = 0; n < 4; n++) {
          const c = accepted.curves[n],
            before = sketch.curves[n];
          assert.ok(c.kind !== "circle" && before.kind !== "circle");
          assert.ok(Math.hypot(c.a.x - before.a.x, c.a.y - before.a.y) < 1e-7);
          assert.ok(Math.hypot(c.b.x - before.b.x, c.b.y - before.b.y) < 1e-7);
        }
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data.sketches[0], before);
        await owner.call({ kind: "redo" });
        assert.deepEqual(owner.view.data.sketches[0], accepted);
      } finally {
        owner.close();
      }
    }
});
