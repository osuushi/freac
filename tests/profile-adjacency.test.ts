import assert from "node:assert/strict";
import test from "node:test";
import { type Circle, emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { appendLine } from "../src/sketch/line-edit.js";
import { ModelSelection } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import { connectedProfiles } from "../src/sketch/profile-adjacency.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";

const circle = (id: string, radius: number, x = 0): Circle => ({
  id,
  kind: "circle",
  construction: false,
  center: { x, y: 0 },
  radius,
});
test("closure crosses several shared edges but excludes disconnected and point-touching cells", () => {
  let sketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 30, y: 10 }).sketch;
  for (const x of [10, 20]) sketch = appendLine(sketch, { x, y: 0 }, { x, y: 10 }).sketch;
  sketch = rectangle(sketch, { x: 30, y: 10 }, { x: 40, y: 20 }).sketch;
  sketch = rectangle(sketch, { x: 50, y: 0 }, { x: 60, y: 10 }).sketch;
  const seed = profileAt(sketch, { x: 5, y: 5 });
  assert.ok(seed);
  const closure = connectedProfiles(profilesFor(sketch), seed);
  assert.equal(closure.length, 3);
  assert.equal(
    closure.reduce((area, p) => area + p.area, 0),
    300,
  );
});
test("nested loops connect across hole boundaries; tangent disks stay separate", () => {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [circle("a", 10), circle("b", 5), circle("c", 2)],
  };
  const profiles = profilesFor(sketch);
  for (const seed of profiles) assert.equal(connectedProfiles(profiles, seed).length, 3);
  const tangent = profilesFor({
    ...emptySketch(planes.XY),
    curves: [circle("a", 5), circle("b", 5, 10)],
  });
  assert.equal(tangent.length, 2);
  assert.equal(connectedProfiles(tangent, tangent[0]).length, 1);
});
test("connected-region selection replaces, adds and toggles the complete set without changing geometry", () => {
  const sketch = { ...emptySketch(planes.XY), curves: [circle("a", 10), circle("b", 5)] };
  const profiles = profilesFor(sketch);
  const selection = new ModelSelection();
  selection.choose({ kind: "sketch", sketch: "other" }, false, false);
  selection.chooseProfiles(sketch.id, [profiles[0]], true, false);
  selection.chooseProfiles(sketch.id, profiles, false, true);
  assert.equal(selection.targets.length, 3, "Partial set toggles to the complete set");
  selection.chooseProfiles(sketch.id, profiles, false, true);
  assert.deepEqual(selection.targets, [{ kind: "sketch", sketch: "other" }]);
  selection.chooseProfiles(sketch.id, profiles, false, false);
  assert.equal(selection.targets.length, 2);
  assert.ok(selection.targets.every((t) => t.kind === "profile"));
});
