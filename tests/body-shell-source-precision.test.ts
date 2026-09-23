import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportBodies } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { shell } from "./shell-fixtures.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/shell-conservative-vertices.json", "utf8"),
) as {
  document: SketchDocument;
  opening: string;
};

test("captured conservative input bounds permit exact shell thickness without changing source", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    const source = JSON.stringify(before);
    for (const thickness of [-1, -2, 1, 2]) {
      const result = await shell(owner, body, thickness, [fixture.opening]);
      assert.equal(JSON.stringify(owner.view.data), source);
      assert.ok(result.volume > 0 && result.volume < body.volume);
      const heights = result.faces.flatMap((f) => (f.plane ? [f.plane.origin[2]] : []));
      for (const z of [-14, 14, -14 - thickness])
        assert.ok(
          heights.some((h) => Math.abs(h - z) < 1e-7),
          `Missing cap at ${z}`,
        );
      for (const radius of [14, 20.09975124224179]) {
        const cylinders = result.faces.flatMap((f) => (f.cylinder ? [f.cylinder] : []));
        for (const r of [radius, radius + thickness])
          assert.ok(cylinders.some((c) => Math.abs(c.radius - r) < 1e-7));
      }
      for (const format of ["stl", "3mf"] as const)
        assert.ok(exportBodies([result], format).length, "Export validates a closed manifold mesh");
      await owner.call({ kind: "discard" });
    }
    await shell(owner, body, -2, [fixture.opening]);
    await owner.call({ kind: "accept" });
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies(owner.view.data.bodies ?? [], format).length);
    await owner.call({ kind: "open", document: fixture.document });
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            axis: [1, 2, 3],
            angle: 37,
            pivot: [0, 0, 0],
            translation: [12, -8, 3],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const rotated = await shell(owner, body, -2, [fixture.opening]);
    // Integrated curved-solid volumes vary slightly with placement (cubic millimeters).
    assert.ok(Math.abs(rotated.volume - (after.bodies?.[0].volume ?? NaN)) < 1e-5);
  } finally {
    owner.close();
  }
});
