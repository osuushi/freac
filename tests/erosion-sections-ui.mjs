import assert from "node:assert/strict";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import {
  erosionBores,
  lobedErosionSource,
} from "../.cache/sketch-tests/tests/erosion-sections-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const owner = new DocumentOwner();
let bores;
try {
  await erosionBores(owner);
  bores = owner.view.data;
} finally {
  owner.close();
}
await withUiRuntimes(
  async (page, runtime) => {
    for (const [name, document] of [
      ["lobed", lobedErosionSource],
      ["bores", bores],
    ]) {
      await openDocument(page, {
        name: `${name}.makeshift`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, document })),
      });
      const before = (await inspect(page)).document;
      await page
        .getByRole("button", { name: /^Select Body / })
        .first()
        .click();
      await chooseTool(page, "erode", "erode");
      assert.equal(
        await page.getByRole("combobox", { name: "Erosion method", exact: true }).inputValue(),
        "fast",
      );
      assert.equal(
        await page.getByRole("textbox", { name: "Minimum thickness", exact: true }).inputValue(),
        "1",
      );
      assert.equal(
        await page
          .getByRole("textbox", { name: "Extra thickness allowance", exact: true })
          .inputValue(),
        "50",
      );
      let state = await inspect(page);
      assert(state.preview, await page.locator(".erosion-status").textContent());
      assert.equal(state.preview.bodies.length, 2);
      assert(state.preview.bodies[1].volume > before.bodies[0].volume * 0.5);
      assert.deepEqual(state.document, before);
      await page.screenshot({
        path: `.cache/sketch-review/${runtime}-erosion-${name}-preview.png`,
      });
      await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
      const accepted = (await inspect(page)).document;
      assert.equal(accepted.bodies.length, 2);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, before);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, accepted);
      await page
        .getByRole("button", { name: /^Select Body / })
        .nth(1)
        .click();
      await page.keyboard.press("m");
      await page.getByRole("button", { name: "Move body X", exact: true }).click();
      await page.locator(".body-transform-value").fill("0.2");
      await page.keyboard.press("Enter");
      state = await inspect(page);
      assert(
        Math.abs(state.document.bodies[1].center[0] - accepted.bodies[1].center[0] - 0.2) < 1e-6,
      );
      await chooseTool(page, "undo", "undo");
      await bodyArchiveRoute(page, `${runtime}-erosion-${name}`);
      const reopened = (await inspect(page)).document;
      const buttons = page.getByRole("button", { name: /^Select Body / });
      await buttons.nth(0).click();
      await buttons.nth(1).click({ modifiers: ["Meta"] });
      await chooseTool(page, "subtract", "subtract");
      state = await inspect(page);
      assert.equal(state.preview?.bodies.length, 1);
      assert(
        Math.abs(
          state.preview.bodies[0].volume - reopened.bodies[0].volume + reopened.bodies[1].volume,
        ) < 1e-3,
      );
      await page.keyboard.press("Enter");
      await inspect(page);
      await bodyArchiveRoute(page, `${runtime}-erosion-${name}-wall`);
      console.log(
        `${runtime}: ${name} default Fast, history, reselect/move, Save/Open and final cavity passed`,
      );
    }
  },
  { timeout: 90000 },
);
