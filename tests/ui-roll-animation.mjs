import assert from "node:assert/strict";

export async function recordRoll(page) {
  await page.evaluate(() => {
    window.rollSamples = [];
    window.rollRecording = true;
    const started = performance.now();
    const sample = () => {
      window.rollSamples.push(window.makeshiftInspect().camera);
      if (performance.now() - started < 650) requestAnimationFrame(sample);
      else window.rollRecording = false;
    };
    sample();
  });
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
