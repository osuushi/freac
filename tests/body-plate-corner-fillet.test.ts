import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/plate-corner-fillet.json", "utf8"));
const cornerIds = [
  "af432686-bdfa-4131-bb54-b9208add7ea6",
  "9e41b7e5-5742-4095-9f28-7589bffe02e5",
  "e5d4b3d9-52d6-446c-b7f0-9a4f81e59aa0",
  "fec80032-7bad-4858-be3b-b83f255a3b6b",
];

test("captured plate fillets its formerly rejected corner alone and with the other corners", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    for (const count of [1, 2, 4]) {
      const reply = await owner.call({
        kind: "finish-edges",
        operation: {
          edges: cornerIds.slice(0, count).map((edge) => ({ body: body.id, edge })),
          size: 2,
          mode: "fillet",
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.edgeSize, 2);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      assert.equal(result.id, body.id);
      const removed = count * 10 * 4 * (1 - Math.PI / 4);
      assert.ok(Math.abs(result.volume - (body.volume - removed)) < 1e-5);
      assert.equal(result.faces.length, body.faces.length + count);
      for (const hole of body.faces.filter((face) => face.cylinder))
        assert.ok(result.faces.some((face) => face.id === hole.id));
      assert.deepEqual(owner.view.data, original);
      if (count < 4) await owner.call({ kind: "discard" });
    }
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    assert.notDeepEqual(accepted, original);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});
