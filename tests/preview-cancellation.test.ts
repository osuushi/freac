import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const shape = () => rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 10 }).sketch;

test("cancel interrupts a native preview, preserves Undo and restarts for the next edit", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = shape();
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const original = owner.view.data;
    const extrusion = {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 10,
      mode: "new" as const,
    };
    const preview = owner.call({ kind: "extrude", extrusion });
    const cancelled = await owner.call({ kind: "cancel-preview" });
    assert.equal(cancelled.error, undefined);
    assert.match((await preview).error ?? "", /cancelled/);
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.data, original);
    assert.equal(owner.view.canUndo, true);
    assert.equal((await owner.call({ kind: "accept" })).error, "No valid edit to accept");
    assert.equal((await owner.call({ kind: "extrude", extrusion })).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.ok(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - 2000) < 1e-7);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});

test("preview cancellation cannot interrupt a committing sketch edit", async () => {
  const owner = new DocumentOwner();
  try {
    const edit = owner.call({ kind: "edit", sketch: shape() });
    assert.match((await owner.call({ kind: "cancel-preview" })).error ?? "", /current edit/);
    assert.equal((await edit).error, undefined);
    assert.equal(owner.view.data.sketches.length, 1);
    assert.equal(owner.view.canUndo, true);
    const preview = owner.call({ kind: "preview", sketch: shape() });
    assert.equal((await owner.call({ kind: "cancel-preview" })).error, undefined);
    assert.match((await preview).error ?? "", /cancelled/);
    assert.equal(owner.view.data.sketches.length, 1);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("a newer drag target stops an obsolete fillet feasibility search", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = shape();
    await owner.call({ kind: "edit", sketch });
    await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 10,
        mode: "new",
      },
    });
    await owner.call({ kind: "accept" });
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    const operation = {
      mode: "fillet" as const,
      size: 1000000,
      edges: [{ body: body.id, edge: body.edges[0].id }],
    };
    const obsolete = owner.call({ kind: "finish-edges", operation });
    await owner.call({ kind: "supersede-preview" });
    assert.equal((await obsolete).error, "Preview superseded");
    assert.equal(owner.view.candidate, null);
    assert.equal(owner.view.data, original);
    const latest = await owner.call({ kind: "finish-edges", operation: { ...operation, size: 1 } });
    assert.equal(latest.error, undefined);
    assert.equal(latest.view.edgeSize, 1);
    assert.ok((latest.view.candidate?.bodies?.[0].volume ?? 0) > 1900);
    assert.ok((latest.view.candidate?.bodies?.[0].volume ?? 2000) < 2000);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});
