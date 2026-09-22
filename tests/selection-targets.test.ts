import assert from "node:assert/strict";
import test from "node:test";
import { emptySketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { SelectedTargets, targetKey } from "../src/sketch/selected-targets.js";

test("point and whole-edge targets remain distinct and ordered across selection restore", () => {
  const selection = new SelectedTargets();
  selection.replace([
    { kind: "endpoint", curve: "a", end: "b" },
    { kind: "curve", curve: "a" },
    { kind: "midpoint", curve: "b" },
  ]);
  assert.deepEqual([...selection.wholeCurves(undefined)], ["a"]);
  assert.deepEqual(selection.points.map(targetKey), ["a/b", "b/midpoint"]);
  const snapshot = selection.targets;
  selection.replace([{ kind: "curve", curve: "other" }]);
  selection.replace(snapshot);
  assert.deepEqual(selection.orderedKeys(undefined), ["a/b", "a", "b/midpoint"]);
});

test("rectangle group selection is explicit; selecting a member or handle never selects its peers", () => {
  const { sketch, group } = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 20, y: 10 });
  const selection = new SelectedTargets();
  selection.replace([{ kind: "curve", curve: group.members[0] }]);
  assert.deepEqual([...selection.wholeCurves(sketch)], [group.members[0]]);
  selection.replace([{ kind: "group-handle", group: group.id, handle: "corner", index: 0 }]);
  assert.equal(selection.wholeCurves(sketch).size, 0);
  selection.replace([{ kind: "group", group: group.id }]);
  assert.deepEqual([...selection.wholeCurves(sketch)], group.members);
  assert.equal(
    selection.wholeCurves({ ...sketch, groups: [] }).size,
    0,
    "Group membership is resolved from the current document, never cached geometry",
  );
});
