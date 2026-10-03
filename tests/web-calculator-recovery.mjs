import assert from "node:assert/strict";
import { at, drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function calculatorRecovery(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await settled(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    for (const pattern of ["**/*solver*.js", "**/*solver*.wasm"]) {
      await context.route(pattern, (route) => route.abort());
      await drag(page, [-15, -10], [15, 10]);
      assert.equal((await inspect(page)).document.sketches.length, 0);
      await context.unroute(pattern);
    }
    // A delayed download lets the ordinary Cancel calculation control terminate the worker.
    let release;
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    await context.route("**/*solver*.wasm", async (route) => {
      await delayed;
      await route.abort().catch(() => {});
    });
    const a = await at(page, -15, -10),
      b = await at(page, 15, 10);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Cancel calculation", exact: true }).click();
    release();
    await settled(page);
    assert.equal((await inspect(page)).document.sketches.length, 0);
    await context.unroute("**/*solver*.wasm");
    await page.keyboard.press("r");
    await drag(page, [-15, -10], [15, 10]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
  } finally {
    await context.close();
  }
}
