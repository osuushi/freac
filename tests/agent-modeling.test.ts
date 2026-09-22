import assert from "node:assert/strict";
import test from "node:test";
import { findInspectionTarget, targetGeometry } from "../src/agent/inspection-geometry.js";
import type { ScriptOperation, SketchResult, SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { planes } from "../src/sketch/planes.js";

test("agent planes are inspectable, independent and preserved by archive/history", async () => {
  const owner = new DocumentOwner();
  try {
    const original = owner.view.data;
    owner.beginScript("planes.ts");
    const result = (await owner.scripts.step({
      kind: "constructionPlane",
      input: { frame: planes.XY },
    })) as { plane: string };
    await owner.scripts.step({
      kind: "constructionPlane",
      input: { id: result.plane, frame: { ...planes.XY, origin: [1, 2, 3] } },
    });
    owner.scripts.finish();
    const accepted = owner.view.data;
    assert.deepEqual(targetGeometry(accepted, findInspectionTarget(accepted, result.plane)), {
      kind: "plane",
      id: result.plane,
      frame: { ...planes.XY, origin: [1, 2, 3] },
    });
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});
test("script face and edge scale reuse exact manual boundary geometry", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("base.ts");
    const s = (await owner.scripts.step({
      kind: "createSketch",
      input: { plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 2 }] },
    })) as SketchResult;
    await owner.scripts.step({
      kind: "extrude",
      input: { sources: s.profiles, distance: 6, mode: "new" },
    });
    owner.scripts.finish();
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert(body);
    const cap = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 6) < 1e-7),
    );
    assert(cap);
    for (const boundary of ["faces", "edges"] as const) {
      const input = {
        kind: "solids" as const,
        ids: [],
        faces: boundary === "faces" ? [{ body: body.id, face: cap.id }] : [],
        edges: boundary === "edges" ? [{ body: body.id, edge: cap.edges[0] }] : [],
        pivot: [0, 0, 6] as [number, number, number],
        factor: 1.2,
      };
      const manual = await owner.call({ kind: "scale", operation: input });
      assert.equal(manual.error, undefined);
      const volume = manual.view.candidate?.bodies?.[0].volume;
      assert(volume);
      await owner.call({ kind: "discard" });
      owner.beginScript("boundary.ts");
      const result = (await owner.scripts.step({ kind: "scale", input })) as SolidResult;
      assert.ok(Math.abs(result.bodies[0].volume - volume) < 1e-7);
      await owner.scripts.cancel();
      assert.equal(owner.view.data, original);
    }
  } finally {
    owner.close();
  }
});
test("invalid modeling targets reject without losing accepted data or Redo", async () => {
  const owner = new DocumentOwner();
  try {
    owner.beginScript("seed.ts");
    await owner.scripts.step({ kind: "constructionPlane", input: { frame: planes.XY } });
    owner.scripts.finish();
    await owner.call({ kind: "undo" });
    const original = owner.view.data;
    const operations: ScriptOperation[] = [
      { kind: "constructionPlane", input: { id: "missing", frame: planes.XY } },
      { kind: "deleteConstructionPlane", input: { id: "missing" } },
      { kind: "scale", input: { kind: "sketches", ids: ["missing"], factor: 2, pivot: [0, 0, 0] } },
      {
        kind: "scale",
        input: { kind: "solids", ids: [], faces: [], edges: [], factor: -1, pivot: [0, 0, 0] },
      },
      { kind: "imprint", input: { targets: [{ body: "missing", faces: [] }], frame: planes.XY } },
      { kind: "splitBody", input: { targets: [], frame: planes.XY } },
    ];
    for (const operation of operations) {
      owner.beginScript("invalid.ts");
      await owner.scripts.step({ kind: "constructionPlane", input: { frame: planes.XY } });
      await assert.rejects(() => owner.scripts.step(operation));
      await owner.scripts.cancel("invalid");
      assert.equal(owner.view.data, original);
      assert(owner.view.canRedo);
    }
  } finally {
    owner.close();
  }
});
