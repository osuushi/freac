import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch } from "../src/sketch/document.js";
import { emptySelection, type HistorySelection } from "../src/sketch/history-selection.js";
import { planes } from "../src/sketch/planes.js";

const selection = (...ids: string[]): HistorySelection => ({
  ...emptySelection(),
  modeling: ids.map((body) => ({ kind: "body", body })),
});
const document = { units: "mm" as const, sketches: [emptySketch(planes.XY)] };

test("selection suffix navigates across geometry and back without eviction", () => {
  const store = new DocumentStore();
  store.accept(document);
  store.selections({ baseline: selection("result"), steps: [selection("a"), selection("b", "a")] });
  store.undo();
  assert.deepEqual(store.selection, selection("a"));
  store.undo();
  assert.deepEqual(store.selection, selection("result"));
  store.undo();
  assert.equal(store.data.sketches.length, 0);
  assert.deepEqual(store.selection, emptySelection());
  store.redo();
  assert.deepEqual(store.selection, selection("result"));
  store.redo();
  assert.deepEqual(store.selection, selection("a"));
  store.redo();
  assert.deepEqual(store.selection, selection("b", "a"));
});

test("new geometry evicts applied and undone selection steps but retains pre-edit selection", () => {
  const store = new DocumentStore();
  store.accept(document);
  store.selections({ baseline: selection(), steps: [selection("a"), selection("b")] });
  store.undo();
  const changed = { ...document, sketches: [] };
  store.accept(changed);
  store.selections({ baseline: selection(), steps: [] });
  store.undo();
  assert.deepEqual(store.data, document);
  assert.deepEqual(store.selection, selection("a"));
  store.undo();
  assert.equal(store.data.sketches.length, 0, "No fine-grained selections remain between edits");
  store.redo();
  store.redo();
  assert.deepEqual(store.selection, selection());
  assert.equal(store.canRedo, false);
});

test("failures/noops preserve selection redo; a new selection branches normally", () => {
  const store = new DocumentStore();
  store.accept(document);
  store.selections({ baseline: selection(), steps: [selection("a"), selection("b")] });
  store.undo();
  store.record({ kind: "edit", parameters: {} }, "failed", "rejected");
  store.accept(document);
  assert.equal(store.canRedo, true);
  store.redo();
  assert.deepEqual(store.selection, selection("b"));
  store.undo();
  store.selections({ baseline: selection("a"), steps: [selection("c")] });
  assert.equal(store.canRedo, false);
  store.undo();
  assert.deepEqual(store.selection, selection("a"));
  store.undo();
  assert.deepEqual(store.selection, selection());
});
