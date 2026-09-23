import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function contactTransition(page, original) {
  await orient(page, [4, 3, 3]);
  await page.getByRole("button", { name: "Move body Z", exact: true }).click();
  await page.locator(".body-transform-value").fill("5");
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).document.bodies[0].bounds[2] > 4.9);
  await orient(page, [1, 1, 4]);
  const pivot = page.getByRole("button", { name: "Reposition body pivot", exact: true });
  await pivot.hover();
  const plane = page.locator(".movement-shadows:visible [data-plane]:visible");
  assert.equal(await plane.getAttribute("data-plane"), "XY");
  assert.equal(await plane.getAttribute("data-contact"), "false");
  assert.ok((await plane.locator(".shadow-surface").getAttribute("d")).length > 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await pivot.hover();
  assert.equal(await plane.getAttribute("data-contact"), "true");
  await page.mouse.move(30, 740);
}
