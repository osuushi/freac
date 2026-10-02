import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-20, -15], [20, 15]);
    await chooseTool(page, "return to modeling", "modeling");
    await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
    await chooseTool(page, "Sketch on XZ", "sketch-xz");
    await page.keyboard.press("c");
    await drag(page, [0, 0], [10, 0]);
    await chooseTool(page, "return to modeling", "modeling");
    await orient(page, [1, -2, 1]);
    const before = (await inspect(page)).document;
    for (const accept of [false, true]) {
      await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
      await chooseTool(page, "Project", "project");
      await pickPlane(page, "XY");
      const preview = (await inspect(page)).preview;
      assert.equal(preview?.sketches.length, 3, "Preview creates a separate sketch");
      assert.deepEqual(preview.sketches.slice(0, 2), before.sketches);
      const result = preview.sketches[2];
      assert.equal(result.curves.length, 1);
      assert.equal(result.curves[0].kind, "segment");
      assert.equal(
        await page.getByRole("button", { name: "Show Sketch 1", exact: true }).count(),
        1,
      );
      await page.screenshot({ path: `.cache/sketch-review/${name}-projection-hidden-target.png` });
      await page.keyboard.press(accept ? "Enter" : "Escape");
      const state = await inspect(page);
      if (!accept) {
        assert.deepEqual(state.document, before);
        continue;
      }
      assert.equal(state.activeSketch, result.id);
      assert.deepEqual(state.document.sketches[2], result);
      assert.deepEqual(state.document.sketches.slice(0, 2), before.sketches);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, before);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, state.document);
    }
    console.log(
      `${name}: hidden destination ignored in projection preview, cancel, accept and Undo/Redo`,
    );
  },
  { defaults: ["chromium", "webkit"] },
);
