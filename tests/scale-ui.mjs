import assert from "node:assert/strict";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { scaleBodyRoute, scaleSketchRoute } from "./ui-scale.mjs";
import { scaleConstraintRoute, scaleWholeSketchRoute } from "./ui-scale-sketches.mjs";

async function run(page, name) {
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await scaleSketchRoute(page, name);
    await scaleBodyRoute(page, name);
    await scaleWholeSketchRoute(page, name);
    await scaleConstraintRoute(page, name);
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: `.cache/sketch-review/${name}-scale-failure.png` });
    console.log(
      await page.evaluate(() => ({
        state: window.freacInspect(),
        status: document.querySelector("[role=status]")?.textContent,
      })),
    );
    throw error;
  }
}
await withUiRuntimes(run);
