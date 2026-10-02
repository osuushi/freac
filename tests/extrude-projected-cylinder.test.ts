import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Extrusion } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/extrude-projected-cylinder.json", "utf8"),
) as {
  document: SketchDocument;
  extrusion: Extrusion;
};

test("captured projected-cylinder extrusion never publishes a partially meshed join", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const joined = await owner.call({ kind: "extrude", extrusion: fixture.extrusion });
    assert.match(joined.error ?? "", /could not mesh every face/);
    assert.deepEqual(joined.view.data, before);
    assert.equal(joined.view.candidate, null);
    const separate = await owner.call({
      kind: "extrude",
      extrusion: { ...fixture.extrusion, mode: "new" },
    });
    assert.equal(separate.error, undefined);
    const prism = separate.view.candidate?.bodies?.at(-1);
    assert.ok(prism);
    // Silhouette of a radius-16, length-24 cylinder tilted 35 degrees to Z.
    const angle = (35 * Math.PI) / 180;
    const area = Math.PI * 16 ** 2 * Math.cos(angle) + 32 * 24 * Math.sin(angle);
    assert.ok(Math.abs(prism.volume - area * 40) < 0.2);
    assert.ok(prism.faces.every((face) => face.vertices.length >= 9));
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 2);
    assert.equal((await owner.call({ kind: "undo" })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "redo" })).error, undefined);
    assert.equal(owner.view.data.bodies?.length, 2);
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
  } finally {
    owner.close();
  }
});
