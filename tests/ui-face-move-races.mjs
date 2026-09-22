import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

// Delay delivery of real kernel replies; do not substitute geometry or edit state.
export async function faceMoveRaceRoute(page) {
  for (const cancel of [false, true]) {
    const original = (await inspect(page)).document;
    await page.getByRole("button", { name: "Move faces X", exact: true }).click();
    await inspect(page);
    let release, reached;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const arrived = new Promise((resolve) => {
      reached = resolve;
    });
    await page.route("**/sketch-api", async (route) => {
      if (route.request().postDataJSON().kind !== "move-faces") return route.continue();
      const response = await route.fetch();
      reached();
      await gate;
      await route.fulfill({ response });
    });
    try {
      const input = page.getByRole("textbox", { name: "Face translation X", exact: true });
      await input.fill("1");
      await arrived;
      if (cancel) await page.keyboard.press("Escape");
      else await input.fill("");
      release();
      await inspect(page);
      assert.deepEqual((await inspect(page)).document, original);
      if (!cancel) {
        assert.equal(
          await page.getByRole("button", { name: "Accept face movement" }).isEnabled(),
          false,
        );
        await input.fill("2");
        await inspect(page);
        assert.equal(
          await page.getByRole("button", { name: "Accept face movement" }).isEnabled(),
          true,
        );
        await page.keyboard.press("Escape");
        await inspect(page);
      }
      assert.equal((await inspect(page)).preview, null);
    } finally {
      release();
      await page.unroute("**/sketch-api");
    }
  }
}
