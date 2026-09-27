import assert from "node:assert/strict";
import test from "node:test";
import { EntityVisibility } from "../src/model/entity-visibility.js";

test("isolation reveals selected owners and exit never hides revealed entities", () => {
  const visibility = new EntityVisibility();
  visibility.hide("body-a");
  visibility.hide("sketch-b");
  visibility.isolate(["body-a", "body-c"]);
  assert.equal(visibility.visible("body-a"), true);
  assert.equal(visibility.visible("body-c"), true);
  assert.equal(visibility.visible("sketch-b"), false);
  assert.equal(visibility.visible("sketch-d"), false);
  visibility.show("sketch-b");
  assert.equal(visibility.visible("sketch-b"), true);
  visibility.endIsolation();
  for (const id of ["body-a", "body-c", "sketch-b", "sketch-d"])
    assert.equal(visibility.visible(id), true, id);
});

test("a deliberate hide during isolation stays hidden on exit; reset clears isolation", () => {
  const visibility = new EntityVisibility();
  visibility.isolate(["body-a"]);
  visibility.hide("body-a");
  visibility.endIsolation();
  assert.equal(visibility.visible("body-a"), false);
  visibility.isolate(["body-b"]);
  visibility.reset();
  assert.equal(visibility.isolating, false);
  assert.equal(visibility.visible("body-a"), true);
});
