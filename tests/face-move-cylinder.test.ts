import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";

test("captured hole move preserves the cylindrical exterior and rejects boundary contact", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/hole-in-cylinder.json", "utf8"));
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    const exterior = body.faces.find((f) => f.cylinder?.outward === 1);
    assert.ok(exterior?.cylinder);
    const request = { kind: "move-faces" as const, operation: fixture.operation };
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    const moved = reply.view.candidate?.bodies?.[0];
    assert.ok(moved);
    assert.deepEqual(owner.view.data, original);
    assert.ok(Math.abs(moved.volume - body.volume) < 1e-6);
    assert.deepEqual(moved.faces.find((f) => f.id === exterior.id)?.cylinder, exterior.cylinder);
    assert.deepEqual(moved.faces.find((f) => f.id === exterior.id)?.signature, exterior.signature);
    assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
    const hole = moved.faces.find((f) => f.id === fixture.operation.faces[0].face);
    assert.ok(hole?.cylinder);
    assert.ok(Math.abs(hole.cylinder.origin[1] - 16) < 1e-7);
    const contact = Math.sqrt((exterior.cylinder.radius - 5) ** 2 - 2 ** 2) - 6;
    for (const distance of [contact, contact + 1, 100]) {
      const rejected = await owner.call({
        ...request,
        operation: { ...fixture.operation, translation: [0, distance, 0] },
      });
      assert.ok(rejected.error, `Reject boundary contact/escape at ${distance}`);
      assert.equal(rejected.view.candidate, null);
      assert.deepEqual(owner.view.data, original);
    }
    assert.equal((await owner.call(request)).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const reverse = await owner.call({
      ...request,
      operation: { ...fixture.operation, translation: [0, -11, 0] },
    });
    assert.equal(reverse.error, undefined);
    const restored = reverse.view.candidate?.bodies?.[0].faces.find((f) => f.id === hole.id);
    assert.ok(restored?.cylinder);
    assert.ok(Math.abs(restored.cylinder.origin[1] - 5) < 1e-7);
  } finally {
    owner.close();
  }
});
