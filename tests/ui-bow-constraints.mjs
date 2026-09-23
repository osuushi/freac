import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function constrainedBowRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await chooseTool(page, "select", "select");
  await click(page, -5, -5);
  let handle = await page.locator(".bow-handle").first().boundingBox();
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.getByRole("textbox", { name: "Bow radius" }).fill("15");
  await page.keyboard.press("Enter");
  const before = (await inspect(page)).document;
  await click(page, 25, 20);
  // Select the midpoint of a remaining line, whose parallel relation survives conversion.
  await click(page, 10, 0);
  assert.equal((await inspect(page)).selectedPoint, `${before.sketches[0].curves[1].id}/midpoint`);
  assert.equal(await page.locator(".bow-handle").count(), 2);
  handle = await page.locator(".bow-handle").first().boundingBox();
  const target = await at(page, 14, 0);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  const after = (await inspect(page)).document;
  assert.equal(after.sketches[0].curves[1].kind, "arc");
  assert.equal(after.sketches[0].curves.filter((c) => c.kind === "arc").length, 2);
  assert.equal(
    after.sketches[0].constraints.some((c) => c.kind === "parallel"),
    false,
  );
  assert.match(await page.getByRole("status").textContent(), /constraint.*removed.*Undo/);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: midpoint bow controls and bowing another constrained rectangle side passed`,
  );
}
