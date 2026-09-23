import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  alignedAxis,
  arrowWidthAxis,
  rotationVisible,
  uprightAxis,
} from "../src/sketch/move-widget/geometry.js";

function camera(position: number[], up = [0, 0, 1]) {
  const result = new THREE.OrthographicCamera();
  result.position.fromArray(position);
  result.up.fromArray(up);
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld();
  return result;
}

test("Move suppresses an end-on axis on either camera side, with a bounded 12 degree tolerance", () => {
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const p = [0, 0, 0];
      p[axis] = sign;
      assert.equal(alignedAxis(camera(p, axis === 2 ? [0, 1, 0] : [0, 0, 1])), axis);
    }
  assert.equal(
    alignedAxis(
      camera([Math.sin((11 * Math.PI) / 180), 0, Math.cos((11 * Math.PI) / 180)], [0, 1, 0]),
    ),
    2,
  );
  assert.equal(
    alignedAxis(
      camera([Math.sin((13 * Math.PI) / 180), 0, Math.cos((13 * Math.PI) / 180)], [0, 1, 0]),
    ),
    null,
  );
  assert.equal(alignedAxis(camera([1, 1, 1])), null);
});

test("Anchor plane follows the upright canonical axis, including Y-up and inverted Y-up", () => {
  assert.deepEqual(uprightAxis(camera([4, 3, 5], [0, 1, 0])), [0, 1, 0]);
  assert.deepEqual(uprightAxis(camera([4, 3, 5], [0, -1, 0])), [0, 1, 0]);
  assert.deepEqual(uprightAxis(camera([4, -5, 3])), [0, 0, 1]);
});

test("rotation markers hide edge-on on either side; reference widths remain perpendicular", () => {
  assert.equal(rotationVisible(camera([1, 0, 0]), [0, 0, 1]), false);
  assert.equal(rotationVisible(camera([0, 0, 1]), [0, 0, 1]), true);
  assert.equal(rotationVisible(camera([0, 0, -1]), [0, 0, 1]), true);
  assert.equal(rotationVisible(camera([1, 0, 0.1]), [0, 0, 1]), false);
  assert.equal(rotationVisible(camera([1, 0, 0.3]), [0, 0, 1]), true);
  assert.deepEqual(arrowWidthAxis([1, 0, 0]), [0, 1, 0]);
  assert.deepEqual(arrowWidthAxis([0, 1, 0]), [1, 0, 0]);
  assert.deepEqual(arrowWidthAxis([0, 0, 1]), [1, 0, 0]);
});
