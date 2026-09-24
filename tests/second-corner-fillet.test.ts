import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { arcCircle } from "../src/sketch/arc-geometry.js";
import { type Sketch, validateSketch } from "../src/sketch/document.js";
import { editFilletRadius } from "../src/sketch/fillet-edit.js";
import { distance } from "../src/sketch/geometry.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/second-corner-fillet.json", "utf8"));
const target: Sketch = fixture.target;

function sameGeometry(actual: Sketch, expected: Sketch) {
  assert.deepEqual(actual.constraints, expected.constraints);
  assert.equal(actual.curves.length, expected.curves.length);
  for (const curve of expected.curves) {
    const result = actual.curves.find((c) => c.id === curve.id);
    assert.ok(curve.kind === "arc" && result?.kind === "arc");
    assert.ok(distance(curve.a, result.a) < 1e-7);
    assert.ok(distance(curve.b, result.b) < 1e-7);
    assert.ok(Math.abs(curve.bulge - result.bulge) < 1e-7);
  }
  validateSketch(actual);
}

test("second curved corner fillet preserves first fillet, radius editing and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "preview", sketch: target })).error, undefined);
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data.sketches[0];
    sameGeometry(accepted, target);
    const fillet = accepted.curves.at(-1);
    assert.ok(fillet?.kind === "arc");
    const resized = editFilletRadius(accepted, fillet, 3);
    assert.ok(resized);
    assert.equal((await owner.call({ kind: "edit", sketch: resized })).error, undefined);
    sameGeometry(owner.view.data.sketches[0], resized);
    const larger = owner.view.data.sketches[0].curves.at(-1);
    assert.ok(larger?.kind === "arc");
    assert.ok(Math.abs(arcCircle(larger).radius - 3) < 1e-7);
    await owner.call({ kind: "undo" });
    sameGeometry(owner.view.data.sketches[0], accepted);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    sameGeometry(owner.view.data.sketches[0], accepted);
  } finally {
    owner.close();
  }
});
