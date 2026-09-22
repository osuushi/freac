import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square } from "./body-edge-fixtures.js";

async function call(owner: DocumentOwner, request: ModelRequest) {
  const reply = await owner.call(request);
  assert.equal(reply.error, undefined);
  return reply.view;
}
async function stack(owner: DocumentOwner, curved = false) {
  let body = curved
    ? await lift(owner, {
        ...emptySketch(planes.XY),
        curves: [
          {
            id: "circle",
            kind: "circle",
            center: { x: 0, y: 0 },
            radius: 5,
            construction: false,
          },
        ],
      })
    : await prism(owner, square);
  for (let i = 0; i < 2; i++) {
    const top = body.faces.find(
      (f) => f.plane && Math.abs(f.plane.origin[2] - 10 * (i + 1)) < 1e-6,
    );
    assert.ok(top);
    await call(owner, {
      kind: "extrude",
      extrusion: { sources: [{ face: top.id }], distance: 10, mode: "new" },
    });
    await call(owner, { kind: "accept" });
    body = owner.view.data.bodies?.at(-1) as Body;
  }
  return owner.view.data;
}
async function union(owner: DocumentOwner, cleanup = false) {
  await call(owner, {
    kind: "boolean-bodies",
    operation: {
      ids: owner.view.data.bodies?.map((b) => b.id) ?? [],
      mode: "union",
      keepOriginals: false,
    },
  });
  await call(owner, { kind: "accept", cleanup });
  return owner.view.data.bodies?.[0] as Body;
}
const whole = (body: Body) => ({ body: body.id, whole: true, faces: [], edges: [] });

test("cleanup stays within bodies, ordinary union retains ribs, explicit cleanup is exact and undoable", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await stack(owner);
    await call(owner, { kind: "cleanup", selection: original.bodies?.map(whole) ?? [] });
    assert.deepEqual(
      owner.view.candidate,
      original,
      "Touching bodies remain separate and no-op is exact",
    );
    await call(owner, { kind: "discard" });
    const joined = await union(owner);
    assert.equal(joined.faces.length, 14);
    const before = owner.view.data;
    await call(owner, { kind: "cleanup", selection: [whole(joined)] });
    const clean = owner.view.candidate?.bodies?.[0] as Body;
    assert.equal(clean.id, joined.id);
    assert.equal(clean.faces.length, 6);
    assert.equal(clean.edges.length, 12);
    assert.ok(Math.abs(clean.volume - 12000) < 1e-6);
    assert.deepEqual(owner.view.data, before);
    const bottom = joined.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v) < 1e-6),
    );
    assert.ok(
      clean.faces.some((f) => f.id === bottom?.id),
      "Unchanged cap retains identity",
    );
    await call(owner, { kind: "accept" });
    const saved = owner.view.data;
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await call(owner, { kind: "redo" });
    assert.deepEqual(owner.view.data, saved);
    await call(owner, { kind: "open", document: JSON.parse(JSON.stringify(saved)) });
    await call(owner, { kind: "cleanup", selection: [whole(owner.view.data.bodies?.[0] as Body)] });
    await call(owner, { kind: "accept" });
    assert.equal(owner.view.canUndo, false, "No-op cleanup does not add history");
  } finally {
    owner.close();
  }
});

test("selected seam or face only cleans incident topology and preserves the other rib", async () => {
  const owner = new DocumentOwner();
  try {
    await stack(owner);
    const joined = await union(owner);
    const seam = joined.edges.find((e) =>
      e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 20) < 1e-6),
    );
    assert.ok(seam);
    await call(owner, {
      kind: "cleanup",
      selection: [{ ...whole(joined), whole: false, edges: [seam.id] }],
    });
    const partial = owner.view.candidate?.bodies?.[0] as Body;
    assert.equal(partial.faces.length, 13);
    assert.ok(!partial.edges.some((e) => e.id === seam.id));
    const untouched = joined.edges.filter((e) => e.id !== seam.id);
    for (const edge of untouched) assert.ok(partial.edges.some((e) => e.id === edge.id));
    await call(owner, { kind: "discard" });
    const face = joined.faces.find(
      (f) => f.edges.includes(seam.id) && f.vertices.every((v, i) => i % 3 !== 2 || v > 19.9),
    );
    assert.ok(face);
    await call(owner, {
      kind: "cleanup",
      selection: [{ ...whole(joined), whole: false, faces: [face.id] }],
    });
    const faceClean = owner.view.candidate?.bodies?.[0] as Body;
    assert.equal(faceClean.faces.length, 13);
    const lowerRib = joined.edges.filter((e) =>
      e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-6),
    );
    for (const edge of lowerRib) assert.ok(faceClean.edges.some((e) => e.id === edge.id));
    const invalid = await owner.call({
      kind: "cleanup",
      selection: [{ ...whole(joined), whole: false, edges: ["missing"] }],
    });
    assert.match(invalid.error ?? "", /no longer exists/);
    assert.equal(owner.view.data.bodies?.[0], joined);
  } finally {
    owner.close();
  }
});

for (const curved of [false, true])
  test(`commit and cleanup shares one Undo and removes ribs (${curved ? "cylinder" : "box"})`, async () => {
    const owner = new DocumentOwner();
    try {
      const original = await stack(owner, curved);
      const body = await union(owner, true);
      assert.equal(body.faces.length, curved ? 3 : 6);
      if (!curved) assert.equal(body.edges.length, 12);
      assert.ok(Math.abs(body.volume - (curved ? Math.PI * 25 * 30 : 12000)) < 1e-6);
      assert.equal(body.faces.filter((f) => f.cylinder).length, curved ? 1 : 0);
      assert.equal(body.faces.filter((f) => f.plane).length, curved ? 2 : 6);
      await call(owner, { kind: "undo" });
      assert.deepEqual(owner.view.data, original);
    } finally {
      owner.close();
    }
  });

test("modal cleanup stays near the new extrusion and does not flood older ribs", async () => {
  const owner = new DocumentOwner();
  try {
    await stack(owner);
    const joined = await union(owner);
    const top = joined.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 30) < 1e-6),
    );
    assert.ok(top);
    const oldRibs = joined.edges.filter((e) =>
      [10, 20].some((z) => e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - z) < 1e-6)),
    );
    await call(owner, {
      kind: "extrude",
      extrusion: { sources: [{ face: top.id }], distance: 10, mode: "union" },
    });
    assert.equal(owner.view.candidate?.bodies?.[0].faces.length, 18);
    await call(owner, { kind: "accept", cleanup: true });
    const body = owner.view.data.bodies?.[0] as Body;
    assert.equal(body.faces.length, 14);
    for (const edge of oldRibs)
      assert.ok(
        body.edges.some((e) => e.id === edge.id),
        "Older ribs stay explicit",
      );
    assert.ok(Math.abs(body.volume - 16000) < 1e-6);
  } finally {
    owner.close();
  }
});

test("ordinary face offset preserves preexisting coplanar subdivisions", async () => {
  const owner = new DocumentOwner();
  try {
    await stack(owner);
    const joined = await union(owner);
    const top = joined.faces.find((f) =>
      f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 30) < 1e-6),
    );
    assert.ok(top);
    await call(owner, {
      kind: "offset-faces",
      operation: { faces: [{ body: joined.id, face: top.id }], distance: 2 },
    });
    assert.equal(owner.view.candidate?.bodies?.[0].faces.length, 14);
    await call(owner, { kind: "accept" });
    assert.equal(owner.view.data.bodies?.[0].faces.length, 14);
  } finally {
    owner.close();
  }
});

test("failed cleanup preserves the valid modal candidate for ordinary acceptance", async (t) => {
  const owner = new DocumentOwner();
  try {
    const original = await stack(owner);
    await call(owner, {
      kind: "boolean-bodies",
      operation: {
        ids: original.bodies?.map((b) => b.id) ?? [],
        mode: "union",
        keepOriginals: false,
      },
    });
    const candidate = owner.view.candidate;
    const calculate = SolidCalculator.prototype.calculate;
    const failure = t.mock.method(
      SolidCalculator.prototype,
      "calculate",
      async function (this: SolidCalculator, input: Parameters<SolidCalculator["calculate"]>[0]) {
        if (input.kind === "cleanup") throw new Error("Injected cleanup failure");
        return calculate.call(this, input);
      },
    );
    const reply = await owner.call({ kind: "accept", cleanup: true });
    assert.equal(reply.error, "Injected cleanup failure");
    const failed = (await owner.call({ kind: "read-history" })).history?.at(-1);
    assert.equal(failed?.error, reply.error);
    assert.equal(failed?.operation.kind, "boolean-bodies");
    assert.equal(failed?.operation.parameters.cleanup, true);
    assert.deepEqual(owner.view.data, original);
    assert.deepEqual(owner.view.candidate, candidate);
    failure.mock.restore();
    await call(owner, { kind: "accept" });
    const accepted = (await owner.call({ kind: "read-history" })).history?.at(-1);
    assert.equal(accepted?.operation.parameters.cleanup, undefined);
    assert.deepEqual(owner.view.data, candidate);
    await call(owner, { kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});

test("cleanup availability probes the candidate without changing geometry or history", async () => {
  const owner = new DocumentOwner();
  try {
    await stack(owner);
    await call(owner, {
      kind: "boolean-bodies",
      operation: {
        ids: owner.view.data.bodies?.map((b) => b.id) ?? [],
        mode: "union",
        keepOriginals: false,
      },
    });
    const before = owner.view;
    await call(owner, { kind: "check-cleanup" });
    assert.equal(owner.view.cleanupAvailable, true);
    assert.equal(owner.view.candidate, before.candidate);
    assert.equal(owner.view.data, before.data);
    assert.equal(owner.view.canUndo, before.canUndo);
    await call(owner, { kind: "accept", cleanup: true });
    const clean = owner.view.data;
    const body = clean.bodies?.[0] as Body;
    await call(owner, { kind: "cleanup", selection: [whole(body)] });
    const candidate = owner.view.candidate;
    await call(owner, { kind: "check-cleanup" });
    assert.equal(owner.view.cleanupAvailable, false);
    assert.equal(owner.view.candidate, candidate);
    assert.equal(owner.view.data, clean);
    await call(owner, { kind: "discard" });
    await call(owner, { kind: "check-cleanup" });
    assert.equal(owner.view.cleanupAvailable, false);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});
