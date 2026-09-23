import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function settledBroom(page, root) {
  await page.waitForFunction(
    (selector) =>
      document.querySelector(`${selector} .commit-cleanup`)?.getAttribute("aria-busy") === "false",
    root,
  );
  return page.getByRole("button", { name: "Commit and clean up", exact: true });
}

export async function axialCleanupRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  const points = [
    [-10, -10],
    [0, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
    [-10, -10],
  ];
  for (let i = 1; i < points.length; i++) await drag(page, points[i - 1], points[i]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  assert.equal(await distance.inputValue(), "0");
  assert.ok(await page.getByRole("button", { name: "Accept extrusion", exact: true }).isDisabled());
  assert.ok(await (await settledBroom(page, ".extrude-controls")).isDisabled());
  await page.keyboard.press("Tab");
  assert.ok(await distance.evaluate((el) => document.activeElement === el));
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByRole("textbox", { name: "Draft value", exact: true })
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press("Shift+Tab");
  assert.ok(await distance.evaluate((el) => document.activeElement === el));
  await distance.fill("10");
  const preview = (await inspect(page)).preview;
  const broom = await settledBroom(page, ".extrude-controls");
  assert.ok(await broom.isEnabled(), "Split extrusion wall is cleanable");
  assert.deepEqual((await inspect(page)).preview, preview);
  await broom.click();
  const cleaned = (await inspect(page)).document;
  assert.ok(cleaned.bodies[0].faces.length < preview.bodies[0].faces.length);
  close(cleaned.bodies[0].volume, preview.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await page.mouse.click(center.x, center.y);
  await distance.fill("10");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  const original = (await inspect(page)).document;
  await page.mouse.click(center.x, center.y);
  const offset = page.getByRole("textbox", { name: "Face offset distance", exact: true });
  assert.equal(await offset.inputValue(), "0");
  assert.ok(
    await page.getByRole("button", { name: "Accept face offset", exact: true }).isDisabled(),
  );
  await page.keyboard.press("Tab");
  assert.ok(await offset.evaluate((el) => document.activeElement === el));
  await offset.fill("1");
  const changed = (await inspect(page)).preview;
  assert.ok(await (await settledBroom(page, ".face-offset-widget")).isEnabled());
  await page.getByRole("button", { name: "Commit and clean up", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.ok(accepted.bodies[0].faces.length < changed.bodies[0].faces.length);
  close(accepted.bodies[0].volume, changed.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
