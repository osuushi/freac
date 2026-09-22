import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { prism, square } from "./body-edge-fixtures.js";

test("automatic Union joins a touching face extrusion and matches explicit Union", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const top = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
    assert.ok(top);
    const extrusion = { sources: [{ face: top.id }], distance: 5 };
    for (const mode of ["auto", "union"] as const) {
      const reply = await owner.call({ kind: "extrude", extrusion: { ...extrusion, mode } });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.booleanMode, "union");
      assert.deepEqual(reply.view.booleanTargets, [body.id]);
      assert.equal(reply.view.candidate?.bodies?.length, 1);
      assert.ok(Math.abs((reply.view.candidate?.bodies?.[0].volume ?? 0) - 6000) < 1e-6);
      assert.equal(reply.view.candidate?.bodies?.[0].faces.length, 10);
    }
    const cut = await owner.call({
      kind: "extrude",
      extrusion: { ...extrusion, distance: -5, mode: "auto" },
    });
    assert.equal(cut.error, undefined);
    assert.equal(cut.view.booleanMode, "subtract");
    assert.ok(Math.abs((cut.view.candidate?.bodies?.[0].volume ?? 0) - 2000) < 1e-6);
  } finally {
    owner.close();
  }
});
