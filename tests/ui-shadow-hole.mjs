import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function shadowHoleRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("c");
  await drag(page, [15, 15], [23, 15]);
  await drag(page, [15, 15], [19, 15]);
  const pick = await at(page, 21, 15);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("6");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await orient(page, [4, 3, 3]);
  const before = (await inspect(page)).document;
  assert.ok(Math.abs(before.bodies[0].volume - Math.PI * 48 * 6) < 1e-5);
  await page.getByRole("button", { name: "Reposition body pivot", exact: true }).hover();
  const shadows = page.locator(".movement-shadows:visible");
  assert.equal(await shadows.count(), 1);
  const fill = await shadows
    .locator('[data-plane="XY"] mask path')
    .last()
    .evaluate((path) => ({
      hole: path.isPointInFill(new DOMPoint(15, 15)),
      material: path.isPointInFill(new DOMPoint(21, 15)),
    }));
  assert.deepEqual(fill, { hole: false, material: true });
  await page.screenshot({ path: `.cache/sketch-review/${name}-movement-shadow-hole.png` });
  await page.mouse.move(30, 740);
  assert.equal(await shadows.count(), 0);
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: curved silhouette preserves its projected opening; anchor hover leaves geometry unchanged`,
  );
}
