import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, EdgeMovement } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { finish, lift, prism, square } from "./body-edge-fixtures.js";

export function atHeight(body: Body, height: number) {
  return body.edges.filter((e) =>
    e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - height) < 1e-6),
  );
}
export async function shoulder(owner: DocumentOwner, round: boolean) {
  const initial = round
    ? await lift(owner, {
        ...emptySketch(planes.XY),
        curves: [
          { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
        ],
      })
    : await prism(owner, square);
  await finish(owner, initial, atHeight(initial, 10), 2, "chamfer");
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const edges = atHeight(body, 8);
  assert.equal(edges.length, round ? 1 : 4);
  const edit: EdgeMovement = {
    edges: edges.map((e) => ({ body: body.id, edge: e.id })),
    translation: [0, 0, 1],
  };
  return { body, edges, edit };
}
export async function rejectionChecks(owner: DocumentOwner, edit: EdgeMovement, round: boolean) {
  const before = owner.view.data;
  for (const translation of [
    [0, 0, -9],
    [0, 0, -8],
  ] as [number, number, number][]) {
    const bad = await owner.call({ kind: "move-edges", operation: { ...edit, translation } });
    assert.ok(bad.error, `Should reject ${translation}`);
    assert.equal(bad.view.candidate, null);
    assert.deepEqual(bad.view.data, before);
  }
  for (const edges of [
    [],
    [...edit.edges, edit.edges[0]],
    [{ ...edit.edges[0], body: "absent" }],
  ]) {
    assert.ok((await owner.call({ kind: "move-edges", operation: { ...edit, edges } })).error);
    assert.deepEqual(owner.view.data, before);
  }
  if (!round) {
    const partial = await owner.call({
      kind: "move-edges",
      operation: { ...edit, edges: edit.edges.slice(0, 1) },
    });
    assert.equal(partial.error, undefined);
    assert.ok(partial.view.candidate);
    assert.deepEqual(partial.view.data, before);
  }
}
export async function historyChecks(owner: DocumentOwner, edit: EdgeMovement, volume: number) {
  const before = owner.view.data;
  assert.equal((await owner.call({ kind: "move-edges", operation: edit })).error, undefined);
  assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  const accepted = owner.view.data;
  await owner.call({ kind: "undo" });
  assert.deepEqual(owner.view.data, before);
  await owner.call({ kind: "redo" });
  assert.deepEqual(owner.view.data, accepted);
  assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  const reopened = owner.view.data;
  const reverse = await owner.call({
    kind: "move-edges",
    operation: { ...edit, translation: [0, 0, -1] },
  });
  assert.equal(reverse.error, undefined);
  assert.ok(Math.abs((reverse.view.candidate?.bodies?.[0].volume ?? 0) - volume) < 1e-6);
  await owner.call({ kind: "cancel-preview" });
  assert.equal(owner.view.candidate, null);
  assert.deepEqual(owner.view.data, reopened);
}
