import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function shadowSketchRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, 5], [25, 20]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await orient(page, [4, 3, 3]);
  const before = (await inspect(page)).document;
  const p = await project(page, [10, 10, 0]);
  await page.keyboard.down("Meta");
  await page.mouse.move(p.x, p.y);
  const shadows = page.locator(".movement-shadows:visible");
  assert.equal(await shadows.count(), 1);
  assert.ok(
    (await shadows.locator("[data-plane]:visible .shadow-current > path").last().getAttribute("d"))
      .length > 0,
  );
  await page.mouse.down();
  await page.mouse.move(p.x - 30, p.y + 20, { steps: 8 });
  assert.equal((await inspect(page)).interaction?.kind, "transform-box-move");
  assert.equal(await shadows.getAttribute("data-moving"), "true");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const after = (await inspect(page)).document;
  assert.notDeepEqual(after.sketches[0].plane.origin, before.sketches[0].plane.origin);
  assert.deepEqual(after.sketches[0].curves, before.sketches[0].curves);
  assert.equal(await shadows.count(), 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: whole-sketch projected curves, planar placement and Undo passed`);
}
