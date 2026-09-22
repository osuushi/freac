import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { validateDocument } from "../src/backend/open-document.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { entityRows } from "../src/model/entity-presentation.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

test("entity organization preserves geometry, history and reopened names/order", async () => {
  const owner = new DocumentOwner();
  try {
    const a = emptySketch(planes.XY),
      b = emptySketch(planes.XY);
    for (const sketch of [a, b])
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    assert.equal(
      (await owner.call({ kind: "rename-entity", id: a.id, name: " Base " })).error,
      undefined,
    );
    await owner.call({ kind: "reorder-entity", id: a.id, beforeId: null });
    const organized = owner.view.data;
    assert.deepEqual(organized.sketches, before.sketches);
    assert.deepEqual(
      entityRows(organized, [a.id, b.id], "Sketch").map((r) => r.name),
      ["Sketch 2", "Base"],
    );
    await owner.call({ kind: "undo" });
    assert.equal(entityRows(owner.view.data, [a.id, b.id], "Sketch")[0].name, "Base");
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, organized);
    assert.ok((await owner.call({ kind: "rename-entity", id: a.id, name: " " })).error);
    assert.deepEqual(owner.view.data, organized);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(organized)) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.entityPresentation, organized.entityPresentation);
  } finally {
    owner.close();
  }
});

test("invalid archive names and duplicate presentation IDs reject", () => {
  for (const entityPresentation of [
    [{ id: "a", name: " " }],
    [
      { id: "a", name: "Name" },
      { id: "a", name: "Other" },
    ],
  ]) {
    assert.throws(
      () => validateDocument({ units: "mm", sketches: [], entityPresentation }),
      /Invalid entity presentation/,
    );
  }
});

test("insertion can cross multiple rows in one Undo and rejects another group", async () => {
  const owner = new DocumentOwner();
  try {
    const sketches = [emptySketch(planes.XY), emptySketch(planes.XZ), emptySketch(planes.YZ)];
    for (const sketch of sketches) await owner.call({ kind: "edit", sketch });
    await owner.call({ kind: "construction-plane", plane: { id: "datum", frame: planes.XY } });
    const before = owner.view.data;
    const ids = sketches.map((s) => s.id);
    assert.equal(
      (await owner.call({ kind: "reorder-entity", id: ids[2], beforeId: ids[0] })).error,
      undefined,
    );
    assert.deepEqual(
      entityRows(owner.view.data, ids, "Sketch").map((r) => r.id),
      [ids[2], ids[0], ids[1]],
    );
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    assert.ok((await owner.call({ kind: "reorder-entity", id: ids[0], beforeId: "datum" })).error);
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "reorder-entity", id: ids[0], beforeId: ids[1] });
    assert.deepEqual(owner.view.data, before, "Dropping in the original slot is a no-op");
    assert.equal(owner.view.canRedo, true);
  } finally {
    owner.close();
  }
});
