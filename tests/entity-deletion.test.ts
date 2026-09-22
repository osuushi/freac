import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism, square } from "./body-edge-fixtures.js";

test("deleting selected bodies and sketches is one direct, undoable document edit", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const sketch = owner.view.data.sketches[0];
    assert.ok(sketch);
    const before = owner.view.data;
    const request = {
      kind: "delete-entities" as const,
      bodyIds: [body.id],
      sketchIds: [sketch.id],
    };
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    assert.deepEqual(owner.view.data.bodies, []);
    assert.deepEqual(owner.view.data.sketches, []);
    const history = (await owner.call({ kind: "read-history" })).history;
    assert.deepEqual(history?.at(-1)?.operation, {
      kind: "delete-entities",
      parameters: { bodyIds: [body.id], sketchIds: [sketch.id] },
    });
    assert.equal(history?.at(-1)?.outcome, "changed");
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.bodies, []);
    const missing = await owner.call({
      kind: "delete-entities",
      bodyIds: [body.id],
      sketchIds: [],
    });
    assert.equal(missing.error, undefined);
    assert.equal(missing.view.canRedo, false);
    assert.equal((await owner.call({ kind: "read-history" })).history?.at(-1)?.outcome, "noop");
  } finally {
    owner.close();
  }
});
