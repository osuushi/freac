import assert from "node:assert/strict";
import test from "node:test";
import type { SketchResult, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";

async function circle(owner: DocumentOwner): Promise<SketchResult> {
  return (await owner.scripts.step({
    kind: "createSketch",
    input: {
      plane: "XY",
      curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 10 }],
    },
  })) as SketchResult;
}
test("multiple real script operations accept once, Undo/Redo restore the whole script", async () => {
  const owner = new DocumentOwner();
  try {
    const original = owner.view.data;
    owner.beginScript("part.ts");
    const sketch = await circle(owner);
    const solid = (await owner.scripts.step({
      kind: "extrude",
      input: {
        sources: sketch.profiles,
        distance: 8,
        mode: "new",
      },
    })) as SolidResult;
    assert(Math.abs(solid.bodies[0].volume - Math.PI * 800) < 1e-6);
    assert.equal(owner.view.data, original);
    assert.match((await owner.call({ kind: "new" })).error ?? "", /running script/);
    assert(owner.scripts.finish());
    const result = owner.view.data;
    assert.equal(result.sketches.length, 1);
    assert.equal(
      (await owner.call({ kind: "read-history" })).history?.filter((e) => e.state === "applied")
        .length,
      1,
    );
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, result);
    const reply = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [solid.bodies[0].id],
        translation: [3, 0, 0],
        axis: [0, 0, 1],
        pivot: [0, 0, 0],
        angle: 0,
        duplicate: false,
      },
    });
    assert.equal(reply.error, undefined);
    assert(owner.view.data.bodies);
    assert(Math.abs(owner.view.data.bodies[0].center[0] - 3) < 1e-6);
  } finally {
    owner.close();
  }
});
test("cancel and runtime-invalid operations preserve accepted geometry and Redo", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("first.ts");
    await circle(owner);
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    owner.beginScript("cancel.ts");
    await circle(owner);
    await owner.scripts.cancel();
    assert.equal(owner.view.data, original);
    assert(owner.view.canRedo);
    owner.beginScript("bad.ts");
    await circle(owner);
    await assert.rejects(
      () =>
        owner.scripts.step({
          kind: "extrude",
          input: {
            sources: [{ face: "missing" }],
            distance: 5,
            mode: "new",
          },
        }),
      /planar face/,
    );
    await owner.scripts.cancel("bad geometry");
    assert.equal(owner.view.data, original);
    assert(owner.view.canRedo);
    owner.beginScript("noop.ts");
    assert.equal(owner.scripts.finish(), false);
    assert(owner.view.canRedo);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data.sketches.length, 1);
  } finally {
    owner.close();
  }
});
