import assert from "node:assert/strict";
import test from "node:test";
import { QuarterTurn } from "../src/sketch/quarter-turn.js";

test("small twist noise cancels and a deliberate turn fires exactly once", () => {
  const gesture = new QuarterTurn(),
    degree = Math.PI / 180;
  assert.equal(gesture.update(8 * degree), 0);
  assert.equal(gesture.update(-8 * degree), 0);
  assert.equal(gesture.update(10 * degree), 0);
  assert.equal(gesture.update(6 * degree), Math.PI / 2);
  assert.equal(gesture.update(100 * degree), 0);
  assert.equal(gesture.update(-150 * degree), 0);
  gesture.reset();
  assert.equal(gesture.update(-16 * degree), -Math.PI / 2);
  assert.equal(gesture.update(Number.NaN), 0);
});
