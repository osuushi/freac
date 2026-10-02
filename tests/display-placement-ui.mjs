import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { bodyMoveRoute, bodySnapRoute } from "./ui-body-move.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { transformBoxRoute } from "./ui-transform-box.mjs";

await withUiRuntimes(
  async (page, name) => {
    await page.addInitScript(() => {
      window.placementShapeSamples = [];
      window.samplePlacement = () => {
        const state = window.makeshiftInspect();
        if (!["body-move", "transform-box-move"].includes(state.interaction?.kind)) return;
        if (!state.preview?.bodies?.length) return;
        window.placementShapeSamples.push(
          state.preview.bodies.some((body) => !Object.hasOwn(body, "brep")),
        );
      };
      window.addEventListener("pointermove", window.samplePlacement);
      window.addEventListener("input", window.samplePlacement);
    });
    await bodyMoveRoute(page, name);
    await bodySnapRoute(page, name);
    const samples = await page.evaluate(() => {
      window.removeEventListener("pointermove", window.samplePlacement);
      window.removeEventListener("input", window.samplePlacement);
      return window.placementShapeSamples;
    });
    assert.ok(samples.some(Boolean), "Real move/copy gestures display bodies without stale BReps");
    await bodyArchiveRoute(page, `${name}-placement`);
    await transformBoxRoute(page, name);
    console.log(
      `${name}: display-only move/copy, exact acceptance, Undo, archive and Transform pass`,
    );
  },
  { timeout: 30000 },
);
