import assert from "node:assert/strict";
import test from "node:test";
import { EntityVisibility } from "../src/model/entity-visibility.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { appendLine } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const sources = (sketch: Sketch) =>
  profilesFor(sketch).map((profile) => ({ sketch: sketch.id, profile: profile.key }));

test("nested regions require the disk as well as the annulus; duplicate inputs do not cover it", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [10, 5].map((radius) => ({
      id: `circle-${radius}`,
      kind: "circle",
      construction: false,
      center: { x: 0, y: 0 },
      radius,
    })),
  };
  const visibility = new EntityVisibility();
  const document = { units: "mm" as const, sketches: [sketch] };
  const [annulus, disk] = sources(sketch);
  visibility.setUsedSketchesVisible(document, [annulus, annulus], false);
  assert.equal(visibility.visible(sketch.id), true);
  visibility.setUsedSketchesVisible(document, [annulus, disk], false);
  assert.equal(visibility.visible(sketch.id), false);
});

test("coverage is per sketch and ignores open curves and face sources", () => {
  const first = appendLine(
    rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 }).sketch,
    { x: 20, y: 0 },
    { x: 25, y: 0 },
  ).sketch;
  const second = { ...first, id: "other-sketch" };
  const open = { ...emptySketch(planes.XY), id: "empty-sketch" };
  const visibility = new EntityVisibility();
  const document = { units: "mm" as const, sketches: [first, second, open] };
  visibility.setUsedSketchesVisible(document, [...sources(first), { face: "face-1" }], false);
  assert.equal(visibility.visible(first.id), false);
  assert.equal(visibility.visible(second.id), true);
  assert.equal(visibility.visible(open.id), true);
  visibility.hidden.delete(first.id);
  assert.equal(visibility.visible(first.id), true, "Ordinary Show restores the sketch");
});

test("sweep history reverses only full-coverage visibility, leaving other hidden entities alone", () => {
  const sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 10 }).sketch;
  const document = { units: "mm" as const, sketches: [sketch] };
  for (const kind of ["extrude", "revolve"] as const) {
    const visibility = new EntityVisibility();
    const operation = {
      kind,
      parameters: {
        [kind === "extrude" ? "extrusion" : "revolution"]: { sources: sources(sketch) },
      },
    };
    visibility.hidden.add("unrelated");
    visibility.setUsedSketchesVisible(document, sources(sketch), false);
    visibility.restoreHistory(document, operation, "undo");
    assert.equal(visibility.visible(sketch.id), true);
    assert.equal(visibility.visible("unrelated"), false);
    visibility.restoreHistory(document, operation, "redo");
    assert.equal(visibility.visible(sketch.id), false);
    visibility.restoreHistory(document, { kind: "edit", parameters: {} }, "undo");
    assert.equal(visibility.visible(sketch.id), false);
  }
});
