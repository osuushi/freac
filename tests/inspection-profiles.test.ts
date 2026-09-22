import assert from "node:assert/strict";
import test from "node:test";
import { targetGeometry } from "../src/agent/inspection-geometry.js";
import type { SolidResult } from "../src/agent-script/api.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

interface Region {
  sketch: string;
  profile: string;
  area: number;
  outer: { curve: string }[];
  holes: { curve: string }[][];
}
function inspected(doc: SketchDocument, id: string): Region[] {
  return (targetGeometry(doc, { kind: "sketch", sketch: id }) as { profiles: Region[] }).profiles;
}
test("inspection identifies distinct and holed regions, refreshes after edits, and is read-only", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        kind: "circle" as const,
        id: "outer",
        center: { x: 0, y: 0 },
        radius: 4,
        construction: false,
      },
      {
        kind: "circle" as const,
        id: "inner",
        center: { x: 0, y: 0 },
        radius: 2,
        construction: false,
      },
      {
        kind: "circle" as const,
        id: "other",
        center: { x: 10, y: 0 },
        radius: 1,
        construction: false,
      },
    ],
  };
  const doc: SketchDocument = { units: "mm", sketches: [sketch] };
  const before = structuredClone(doc),
    profiles = inspected(doc, sketch.id);
  assert.equal(profiles.length, 3);
  const ring = profiles.find((p) => p.holes.length);
  assert(ring);
  assert.ok(Math.abs(ring.area - 12 * Math.PI) < 1e-7);
  assert.deepEqual([...new Set(ring.outer.map((s) => s.curve))], ["outer"]);
  assert.deepEqual([...new Set(ring.holes.flat().map((s) => s.curve))], ["inner"]);
  assert.deepEqual(doc, before);
  const open = {
    ...sketch,
    curves: [
      {
        kind: "segment" as const,
        id: "line",
        a: { x: 0, y: 0 },
        b: { x: 1, y: 0 },
        construction: false,
      },
    ],
  };
  assert.deepEqual(inspected({ ...doc, sketches: [open] }, sketch.id), []);
});
test("current inspected source feeds a sweep; guessed keys and missing sketches have accurate errors", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = {
      ...emptySketch(planes.XY),
      curves: [
        {
          kind: "circle" as const,
          id: "circle",
          center: { x: 0, y: 0 },
          radius: 2,
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data,
      sources = inspected(before, sketch.id);
    const path = [
      {
        kind: "line" as const,
        a: [0, 0, 0] as [number, number, number],
        b: [0, 0, 5] as [number, number, number],
      },
    ];
    for (const [source, message] of [
      [
        { sketch: sketch.id, profile: `${sketch.id}:profile:0` },
        /Profile key does not match a current closed region/,
      ],
      [{ sketch: "missing", profile: "missing" }, /Source sketch does not exist/],
    ] as const) {
      owner.beginScript("bad.ts");
      await assert.rejects(
        () =>
          owner.scripts.step({ kind: "sweep", input: { sources: [source], path, mode: "new" } }),
        message,
      );
      await owner.scripts.cancel("invalid");
      assert.equal(owner.view.data, before);
    }
    owner.beginScript("existing.ts");
    const result = (await owner.scripts.step({
      kind: "sweep",
      input: { sources, path, mode: "new" },
    })) as SolidResult;
    assert.ok(Math.abs(result.bodies[0].volume - 20 * Math.PI) < 1e-6);
    owner.scripts.finish();
    assert.equal(owner.view.data.sketches.length, 1);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});
