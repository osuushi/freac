import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { PlaneCut } from "../src/model/plane-cut.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("exact cutting-reference checks preserve candidate/history and exclude ineffective planes", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 20 }).sketch;
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            distance: 20,
            mode: "new",
          },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const original = owner.view.data,
      body = original.bodies?.[0];
    assert.ok(body);
    const operation: PlaneCut = {
      mode: "imprint",
      targets: [{ body: body.id }],
      frame: { ...planes.XY, origin: [0, 0, 10] },
    };
    const history = (await owner.call({ kind: "read-history" })).history;
    for (const [frame, expected] of [
      [operation.frame, true],
      [planes.XY, false],
      [{ ...planes.XY, origin: [0, 0, 20] }, false],
      [{ ...planes.XY, origin: [0, 0, 30] }, false],
    ] as [PlaneFrame, boolean][]) {
      const reply = await owner.call({
        kind: "check-plane-cut",
        operation: { ...operation, frame },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.planeCutAvailable, expected);
      assert.deepEqual(reply.view.data, original);
      assert.equal(reply.view.candidate, null);
    }
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
    await owner.call({ kind: "plane-cut", operation });
    const preview = owner.view.candidate;
    assert.ok(preview);
    await owner.call({ kind: "check-plane-cut", operation: { ...operation, frame: planes.XY } });
    assert.deepEqual(owner.view.candidate, preview);
    await owner.call({ kind: "accept" });
    assert.equal(
      (await owner.call({ kind: "check-plane-cut", operation })).view.planeCutAvailable,
      false,
      "Existing imprint is excluded",
    );
    assert.equal(
      (await owner.call({ kind: "check-plane-cut", operation: { ...operation, mode: "split" } }))
        .view.planeCutAvailable,
      true,
      "Split still cuts through imprint seam",
    );
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.canRedo, true);
    await owner.call({ kind: "check-plane-cut", operation });
    assert.equal(owner.view.canRedo, true);
    const cap = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 20) < 1e-7),
    );
    assert.ok(cap);
    assert.equal(
      (
        await owner.call({
          kind: "check-plane-cut",
          operation: { ...operation, targets: [{ body: body.id, faces: [cap.id] }] },
        })
      ).view.planeCutAvailable,
      false,
      "Plane misses selected face although it cuts body",
    );
  } finally {
    owner.close();
  }
});
