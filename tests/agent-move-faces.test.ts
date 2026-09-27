import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";

test("script moves an existing hole wall and accepts one Undo step", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/hole-in-cylinder.json", "utf8"));
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    owner.beginScript("Move hole toward center");
    const result = await owner.scripts.step({ kind: "moveFaces", input: fixture.operation });
    assert.ok(result);
    assert.deepEqual(owner.view.data, original);
    assert.equal(owner.scripts.finish(), true);
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    assert.equal(moved.id, body.id);
    assert.deepEqual(
      moved.faces.map((face) => face.id).sort(),
      body.faces.map((face) => face.id).sort(),
    );
    const hole = moved.faces.find((face) => face.id === fixture.operation.faces[0].face);
    assert.ok(hole?.cylinder);
    assert.ok(Math.abs(hole.cylinder.origin[1] - 16) < 1e-7);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.bodies, [moved]);
  } finally {
    owner.close();
  }
});

test("invalid scripted face movement leaves accepted geometry unchanged", async () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/hole-in-cylinder.json", "utf8"));
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "open", document: fixture.document });
    const original = owner.view.data;
    owner.beginScript("Invalid move");
    await assert.rejects(
      owner.scripts.step({ kind: "moveFaces", input: { ...fixture.operation, faces: [] } }),
      /Invalid script face movement/,
    );
    await owner.scripts.cancel();
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});
