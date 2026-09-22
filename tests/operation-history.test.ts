import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { prism, square } from "./body-edge-fixtures.js";
import { feature, selected } from "./face-movement-fixtures.js";

const operation = (name: string) => ({ kind: "edit" as const, parameters: { name } });
const document = (name: string): SketchDocument => ({
  units: "mm",
  sketches: [{ ...emptySketch(planes.XY), id: name }],
});
async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply;
}

test("one history navigates changed entries, skips failures/noops, preserves diagnostics and branches", () => {
  const store = new DocumentStore();
  const empty = store.data,
    a = document("a"),
    b = document("b"),
    c = document("c");
  store.record(operation("initial failure"), "failed", "No matching face");
  assert.equal(store.canUndo, false);
  store.accept(a, operation("A"));
  store.record(operation("failure between edits"), "failed", "Cannot heal");
  store.accept(a, operation("no change"));
  store.accept(b, operation("B"));
  store.record(operation("last failure"), "failed", "Sharp edge");
  const attempts = store.history.length;
  store.undo();
  assert.deepEqual(store.data, a);
  store.undo();
  assert.deepEqual(store.data, empty);
  assert.equal(store.canUndo, false);
  assert.equal(store.canRedo, true);
  store.redo();
  assert.deepEqual(store.data, a);
  store.record(operation("failed after undo"), "failed", "Still cannot heal");
  store.accept(a, operation("no-op after undo"));
  assert.equal(store.canRedo, true);
  store.redo();
  assert.deepEqual(store.data, b);
  store.undo();
  store.accept(c, operation("branch C"));
  assert.equal(store.canRedo, false);
  assert.equal(store.history.find((e) => e.operation.parameters.name === "B")?.state, "superseded");
  assert.equal(store.history.length, attempts + 3);
  assert.equal(store.history.filter((e) => e.outcome === "failed").length, 4);
  store.undo();
  assert.deepEqual(store.data, a);
  store.redo();
  assert.deepEqual(store.data, c);
  const snapshot = store.history;
  snapshot[0].operation.parameters.name = "tampered";
  assert.equal(store.history[0].operation.parameters.name, "initial failure");
  assert.ok(!JSON.stringify(store.history).includes('"before"'));
});

test("immediate deletion records exact selection and failure, Undo skips rejection, Redo survives no-op", async () => {
  const owner = new DocumentOwner();
  try {
    await prism(owner, square);
    const body = await feature(owner, "hole"),
      before = owner.view.data;
    const selection = [
      { body: body.id, whole: false, faces: selected(body, "hole").map((t) => t.face), edges: [] },
    ];
    await call(owner, { kind: "delete-topology", selection });
    const after = owner.view.data;
    assert.equal(owner.view.candidate, null);
    const cap = after.bodies?.[0].faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || v === 10),
    );
    assert.ok(cap);
    const rejectedSelection = [{ ...selection[0], faces: [cap.id] }];
    const rejected = await owner.call({ kind: "delete-topology", selection: rejectedSelection });
    assert.ok(rejected.error);
    assert.deepEqual(owner.view.data, after);
    let history = (await call(owner, { kind: "read-history" })).history;
    assert.ok(history);
    assert.equal(history.at(-1)?.error, rejected.error);
    assert.deepEqual(history.at(-1)?.operation.parameters.selection, rejectedSelection);
    assert.equal(history.at(-2)?.outcome, "changed");
    assert.deepEqual(history.at(-2)?.operation.parameters.selection, selection);
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await call(owner, { kind: "delete-sketch", sketchId: "not-present" });
    assert.equal(owner.view.canRedo, true);
    await call(owner, { kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    history = (await call(owner, { kind: "read-history" })).history;
    assert.equal(history?.at(-1)?.outcome, "noop");
    assert.equal(history?.at(-2)?.error, rejected.error);
    assert.ok(!JSON.stringify(after).includes("history"));
    await call(owner, { kind: "open", document: after });
    assert.deepEqual((await call(owner, { kind: "read-history" })).history, []);
  } finally {
    owner.close();
  }
});

test("preview failures and cancellation remain diagnostic; successful preview only records on commit", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      before = owner.view.data;
    const top = body.faces.find((f) => f.vertices.every((v, i) => i % 3 !== 2 || v === 10));
    assert.ok(top);
    const extrusion = { sources: [{ face: top.id }], distance: 2, mode: "union" as const };
    const count = (await call(owner, { kind: "read-history" })).history?.length;
    await call(owner, { kind: "extrude", extrusion });
    assert.equal((await call(owner, { kind: "read-history" })).history?.length, count);
    await call(owner, { kind: "cancel-preview" });
    assert.equal(
      (await call(owner, { kind: "read-history" })).history?.at(-1)?.outcome,
      "cancelled",
    );
    const rejected = await owner.call({
      kind: "extrude",
      extrusion: { ...extrusion, distance: 0 },
    });
    assert.ok(rejected.error);
    await call(owner, { kind: "extrude", extrusion });
    await call(owner, { kind: "accept", cleanup: true });
    const history = (await call(owner, { kind: "read-history" })).history;
    assert.equal(history?.at(-2)?.error, rejected.error);
    assert.equal(history?.at(-1)?.operation.kind, "extrude");
    assert.deepEqual(history?.at(-1)?.operation.parameters, { extrusion, cleanup: true });
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
