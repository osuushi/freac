import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { DocumentStore } from "../src/backend/document-store.js";
import { validateDocument } from "../src/backend/document-validation.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

const sketch = { ...emptySketch(planes.XY), id: "shared" };
const valid: SketchDocument = { units: "mm", sketches: [sketch] };
const invalid: SketchDocument = {
  ...valid,
  constructionPlanes: [{ id: sketch.id, frame: planes.XY }],
};

test("every snapshot validates document-wide identities before touching Undo or selection", () => {
  assert.throws(() => new DocumentStore(invalid), /document identity/);
  const store = new DocumentStore();
  store.accept(valid);
  const selection = { workspace: null, sketch: [], modeling: [] };
  store.selections({ baseline: selection, steps: [] });
  store.accept({ ...valid, constructionPlanes: [{ id: "datum", frame: planes.XY }] });
  store.undo();
  const history = store.history;
  assert.throws(() => store.accept(invalid), /document identity/);
  assert.equal(store.data, valid);
  assert.deepEqual(store.selection, selection);
  assert.deepEqual(store.history, history);
  assert.equal(store.canRedo, true);
  store.redo();
  assert.equal(store.data.constructionPlanes?.[0].id, "datum");
});

test("manual sketch edits enforce the same whole-document identities as Open", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal(
      (await owner.call({ kind: "construction-plane", plane: { id: "shared", frame: planes.XY } }))
        .error,
      undefined,
    );
    const before = owner.view.data;
    const rejected = await owner.call({ kind: "edit", sketch });
    assert.match(rejected.error ?? "", /document identity/);
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.canRedo, true);
    assert.match((await owner.call({ kind: "open", document: invalid })).error ?? "", /identity/);
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});

test("curve IDs remain local to each sketch", () => {
  const a = {
    ...sketch,
    curves: [
      {
        id: "edge",
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius: 2,
        construction: false,
      },
    ],
  };
  assert.doesNotThrow(() =>
    validateDocument({ units: "mm", sketches: [a, { ...a, id: "other" }] }),
  );
});
