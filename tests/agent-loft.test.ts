import assert from "node:assert/strict";
import { test } from "node:test";
import type { SketchResult, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { planes } from "../src/sketch/planes.js";

test("typed script loft uses the manual kernel and one atomic script Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const original = owner.view.data;
    owner.beginScript("loft.ts");
    const profiles = [];
    for (const [z, radius] of [
      [0, 5],
      [10, 3],
    ]) {
      const sketch = (await owner.scripts.step({
        kind: "createSketch",
        input: {
          plane: { ...planes.XY, origin: [0, 0, z] },
          curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius }],
        },
      })) as SketchResult;
      profiles.push(sketch.profiles[0]);
    }
    const result = (await owner.scripts.step({
      kind: "loft",
      input: { sources: profiles, ruled: true, mode: "new" },
    })) as SolidResult;
    assert.ok(Math.abs(result.bodies[0].volume - ((Math.PI * 10) / 3) * (25 + 15 + 9)) < 1e-5);
    assert.equal(owner.view.data, original);
    owner.scripts.finish();
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    owner.beginScript("bad-loft.ts");
    await assert.rejects(
      owner.scripts.step({
        kind: "loft",
        input: { sources: profiles, ruled: true, alignment: [0, NaN], mode: "new" },
      }),
      /alignment/,
    );
    await owner.scripts.cancel();
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});
