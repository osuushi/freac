import assert from "node:assert/strict";
import { click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function pointEdgeRoute(page, name) {
  for (const reverse of [false, true]) {
    await reset(page);
    await page.getByRole("button", { name: "Sketch on XY" }).click();
    await page.keyboard.press("l");
    await drag(page, [0, 4], [0, 12]);
    await page.keyboard.press("l");
    await drag(page, [-10, 0], [10, 0]);
    await page.keyboard.press("v");
    const before = (await inspect(page)).document;
    await click(page, ...(reverse ? [-5, 0] : [0, 4]));
    await page.keyboard.down("Shift");
    await click(page, ...(reverse ? [0, 4] : [-5, 0]));
    await page.keyboard.up("Shift");
    const selection = await inspect(page);
    assert.equal(selection.pointChoice?.length, 1, JSON.stringify({ reverse, selection }));
    assert.deepEqual(selection.selectedCurves, [before.sketches[0].curves[1].id]);
    await page.getByRole("button", { name: "Constrain point on edge", exact: true }).click();
    const after = (await inspect(page)).document.sketches[0];
    assert.equal(after.constraints[0].kind, "point-on-edge");
    pointEquals(after.curves[0].a, [0, reverse ? 4 : 0]);
    pointEquals(after.curves[0].b, [0, 12]);
    pointEquals(after.curves[1].a, [-10, reverse ? 4 : 0]);
    pointEquals(after.curves[1].b, [10, reverse ? 4 : 0]);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(`${name}: ordered mixed point/edge selection, native coincidence and Undo passed`);
}
