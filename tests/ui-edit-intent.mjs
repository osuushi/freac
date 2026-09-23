import assert from "node:assert/strict";
import { drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function editIntentRoute(page, name) {
  const results = [];
  for (const extra of [false, true]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [-10, -5], [10, 5]);
    if (extra) {
      await page.keyboard.press("l");
      await drag(page, [-25, 15], [-15, 15]);
      await page.getByRole("button", { name: "Constrain horizontal", exact: true }).click();
      await inspect(page);
    }
    const before = (await inspect(page)).document.sketches[0];
    await page.keyboard.press("v");
    await drag(page, [-10, 0], [-14, 0]);
    let sketch = (await inspect(page)).document.sketches[0];
    pointEquals(sketch.curves[0].a, [-14, -5]);
    pointEquals(sketch.curves[0].b, [10, -5]);
    await page.getByRole("textbox", { name: "Width", exact: true }).fill("26");
    await page.keyboard.press("Enter");
    sketch = (await inspect(page)).document.sketches[0];
    pointEquals(sketch.curves[0].a, [-16, -5]);
    pointEquals(sketch.curves[0].b, [10, -5]);
    results.push(sketch.curves.slice(0, 4).map(({ a, b }) => ({ a, b })));
    if (extra) assert.deepEqual(sketch.curves[4], before.curves[4]);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document.sketches[0], before);
  }
  assert.deepEqual(results[0], results[1]);
  console.log(
    `${name}: rectangle pointer/numeric anchors independent of disconnected constraints; Undo passed`,
  );
}
