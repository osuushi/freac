import assert from "node:assert/strict";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

export async function trimCancellationRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.keyboard.press("t");
  const original = (await inspect(page)).document;
  let release, reached;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const arrived = new Promise((resolve) => {
    reached = resolve;
  });
  await page.route("**/sketch-api", async (route) => {
    if (route.request().postDataJSON().kind !== "preview") return route.continue();
    const response = await route.fetch(); // Real native calculation, delayed delivery only.
    reached();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await click(page, -4, -6);
    await Promise.race([
      arrived,
      page.waitForTimeout(15000).then(() => {
        throw new Error("Trim preview did not arrive");
      }),
    ]);
    assert.deepEqual(await page.evaluate(() => window.freacInspect().interaction), {
      kind: "trim",
      phase: "waiting",
    });
    await page.keyboard.press("Escape");
    release();
    await page.waitForFunction(() => window.freacInspect().interaction === null);
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal(await toolEnabled(page, "redo", "redo"), false);
  } finally {
    release();
    await page.unroute("**/sketch-api");
  }
  await click(page, -4, -6);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "Cancelled trim adds no Undo");
  console.log(`${name}: Escape cancels a trim awaiting an actual solve; next trim and Undo pass`);
}
