import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function overlapCancellation(page, point, hold) {
  const before = await inspect(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  assert.equal(await panel.isVisible(), false);
  assert.equal(
    (await inspect(page)).activePlane,
    null,
    "Canceling a pending hold consumes the release click",
  );
  await hold(page, point);
  await page.mouse.move(30, 35);
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false, "Release outside cancels without a second tap");
  assert.deepEqual((await inspect(page)).modelingSelection, before.modelingSelection);
  await hold(page, point);
  await panel.waitFor({ state: "visible" });
  await page.keyboard.press("Meta+f");
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false, "Tool search dismisses the selection chooser");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before.document);
}
