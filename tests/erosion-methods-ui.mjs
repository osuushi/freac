import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await plate(page);
    await chooseTool(page, "select owning bodies", "selection-bodies");
    const original = (await inspect(page)).document;
    await chooseTool(page, "erode", "erode");
    const method = page.getByRole("combobox", { name: "Erosion method", exact: true });
    const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
    assert.equal(await method.inputValue(), "fast");
    const fast = (await inspect(page)).preview.bodies.at(-1);
    assert(fast.volume > 17 ** 2 * 7 && fast.volume < 18 ** 2 * 8);
    await method.selectOption("accurate");
    close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
    await page.locator(".erosion-status").click();
    await page.keyboard.press("Meta+z");
    let state = await inspect(page);
    assert.equal(await method.inputValue(), "fast");
    close(state.preview.bodies.at(-1).volume, fast.volume);
    await page.keyboard.press("Meta+Shift+z");
    state = await inspect(page);
    assert.equal(await method.inputValue(), "accurate");
    close(state.preview.bodies.at(-1).volume, 2592);
    await allowance.fill("0");
    close((await inspect(page)).preview.bodies.at(-1).volume, 2592);
    await method.selectOption("fast");
    state = await inspect(page);
    assert.equal(state.preview, null);
    assert.deepEqual(state.document, original);
    assert.match(await page.locator(".erosion-status").textContent(), /Accurate/);
    assert(await page.getByRole("button", { name: "Accept erosion", exact: true }).isDisabled());
    await method.selectOption("accurate");
    await inspect(page);
    await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
    const accepted = (await inspect(page)).document;
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await bodyArchiveRoute(page, `${name}-erosion-methods`);
    const reopened = (await inspect(page)).document;
    await page
      .getByRole("button", { name: /^Select Body / })
      .first()
      .click();
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
    await page.locator('[data-command="erode"]').click();
    assert.equal(await method.inputValue(), "fast");
    await method.selectOption("accurate");
    await method.selectOption("fast");
    await page.keyboard.press("Escape");
    state = await inspect(page);
    assert.equal(state.interaction, null);
    assert.deepEqual(state.document, reopened);
    console.log(
      `${name}: Fast default, method Undo/Redo, zero allowance, acceptance/archive and cancellation passed`,
    );
  },
  { timeout: 30000 },
);
