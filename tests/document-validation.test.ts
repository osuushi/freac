import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { DocumentStore } from "../src/backend/document-store.js";
import { validateDocument } from "../src/backend/document-validation.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
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

test("malformed sketch identities and groups cannot publish or destroy Redo", () => {
  const shape = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 6 }).sketch;
  const document: SketchDocument = { units: "mm", sketches: [shape] };
  const store = new DocumentStore(document);
  store.accept({ ...document, sketches: [...document.sketches, emptySketch(planes.XZ)] });
  store.undo();
  const before = store.history;
  const malformed = [
    { ...shape, curves: shape.curves.map((curve, i) => (i ? curve : { ...curve, id: "" })) },
    {
      ...shape,
      curves: shape.curves.map((curve, i) =>
        i ? curve : { ...curve, id: 4 as unknown as string },
      ),
    },
    {
      ...shape,
      constraints: shape.constraints.map((constraint, i) =>
        i ? constraint : { ...constraint, id: "" },
      ),
    },
    { ...shape, groups: [{ ...shape.groups[0], id: "" }] },
    { ...shape, groups: [shape.groups[0], shape.groups[0]] },
    {
      ...shape,
      groups: [{ ...shape.groups[0], members: Array(4).fill(shape.curves[0].id) as string[] }],
    },
  ];
  for (const rejected of malformed) {
    assert.throws(
      () => store.accept({ ...document, sketches: [rejected] }),
      /identity|rectangle group/,
    );
    assert.equal(store.data, document);
    assert.deepEqual(store.history, before);
    assert.equal(store.canRedo, true);
  }
  store.redo();
  assert.equal(store.data.sketches.length, 2);
});
