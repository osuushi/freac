import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearDefinition } from "../src/decorators/gear-settings.js";
import { prism } from "./body-edge-fixtures.js";

test("rack surface replacement can be inspected and repaired using a new saved frame", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [-10, -5],
      [10, -5],
      [10, 5],
      [-10, 5],
    ]);
    const top = body.faces.find(
      (f) => f.plane && f.vertices.every((n, i) => i % 3 !== 2 || Math.abs(n - 10) < 1e-7),
    );
    assert.ok(top);
    const faces = [{ body: body.id, face: top.id }];
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: gearDefinition, faces },
        })
      ).error,
      undefined,
    );
    assert.equal(
      (await owner.call({ kind: "offset-faces", operation: { faces, distance: 1 } })).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const instance = owner.view.data.decorators?.[0];
    assert.ok(instance?.problem);
    const query = {
      definition: gearDefinition,
      version: 1,
      faces,
      instanceId: instance.id,
      reassign: true,
    };
    const inspection = await owner.call({ kind: "decorator-inspect", query });
    assert.equal(inspection.decoratorInspection?.reason, null);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "reassign", id: instance.id, faces },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.decorators?.[0].problem, undefined);
    assert.equal(owner.view.data.decorators?.[0].frame.origin[2], 11);
    await owner.call({ kind: "undo" });
    assert.ok(owner.view.data.decorators?.[0].problem);
  } finally {
    owner.close();
  }
});
