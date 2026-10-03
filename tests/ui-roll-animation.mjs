import assert from "node:assert/strict";
import * as THREE from "three";

export async function recordRoll(page) {
  const bounds = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  await page.evaluate((bounds) => {
    window.rollBounds = bounds;
    window.rollSamples = [];
    window.rollRecording = true;
    const started = performance.now();
    const sample = () => {
      window.rollSamples.push(window.makeshiftInspect().camera);
      if (performance.now() - started < 650) requestAnimationFrame(sample);
      else window.rollRecording = false;
    };
    sample();
  }, bounds);
}
export async function assertSmoothRoll(page, before, expected) {
  await page.waitForFunction(() => !window.rollRecording);
  const samples = await page.evaluate(() => window.rollSamples);
  const start = before.camera.up;
  const angles = samples.map(({ up }) =>
    Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          up.reduce((sum, v, i) => sum + v * start[i], 0),
        ),
      ),
    ),
  );
  const end = angles.at(-1);
  if (expected !== undefined) assert.ok(Math.abs(end - expected) < 1e-6);
  assert.ok(end > 0.4 && end < Math.PI, "A deliberate turn occurs");
  assert.ok(
    angles.filter((v) => v > 0.02 && v < end - 0.02).length >= 4,
    "Multiple intermediate frames, not an instant jump",
  );
  for (let i = 1; i < angles.length; i++) {
    assert.ok(angles[i] >= angles[i - 1] - 1e-6, "No overshoot or backward correction");
  }
}

/** The world point under the gesture follows only its cursor/midpoint, on every frame. */
export async function assertRollAnchor(page, before, anchor, positions = [anchor]) {
  const { samples, bounds } = await page.evaluate(() => ({
    samples: window.rollSamples,
    bounds: window.rollBounds,
  }));
  const makeCamera = (state) => {
    const h = state.height / 2,
      w = (h * bounds.width) / bounds.height;
    const camera = new THREE.OrthographicCamera(-w, w, h, -h, 0.1, 10000);
    camera.position.fromArray(state.position);
    camera.up.fromArray(state.up);
    camera.lookAt(new THREE.Vector3(...state.target));
    camera.updateMatrixWorld();
    return camera;
  };
  const camera = makeCamera(before.camera);
  const pivot = new THREE.Vector3(...before.camera.target)
    .addScaledVector(
      new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
      ((anchor.x - bounds.x - bounds.width / 2) * before.camera.height) / bounds.height,
    )
    .addScaledVector(
      new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
      (-(anchor.y - bounds.y - bounds.height / 2) * before.camera.height) / bounds.height,
    );
  for (const sample of samples) {
    const projected = pivot.clone().project(makeCamera(sample));
    const x = bounds.x + ((projected.x + 1) * bounds.width) / 2;
    const y = bounds.y + ((1 - projected.y) * bounds.height) / 2;
    assert.ok(
      positions.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-5),
      `Gesture anchor drifted to ${x}, ${y}`,
    );
  }
}
