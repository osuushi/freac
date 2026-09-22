import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function settledBroom(page) {
  const broom = page.getByRole("button", { name: "Commit and clean up", exact: true });
  await page.waitForFunction(() => {
    const button = document.querySelector(".body-edge-finish-widget .commit-cleanup");
    return button?.getAttribute("aria-busy") === "false";
  });
  return broom;
}
export async function cleanupAvailabilityRoute(page, plate) {
  await plate(page);
  const input = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  await input.fill("1");
  const before = await inspect(page);
  assert.ok(await (await settledBroom(page)).isDisabled());
  assert.deepEqual((await inspect(page)).preview, before.preview, "Probe preserves the candidate");
  for (const size of ["1.1", "1.2", "1.3"]) await input.fill(size);
  await inspect(page);
  assert.ok(await (await settledBroom(page)).isDisabled());
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before.document);
  for (const mode of ["fillet", "chamfer"]) {
    await reset(page);
    await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
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
    const center = await at(page, 0, 0),
      edge = await at(page, -5, -10);
    await chooseTool(page, "return to modeling", "modeling");
    await page.mouse.click(center.x, center.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    const original = (await inspect(page)).document;
    await page.mouse.click(edge.x, edge.y);
    if (mode === "chamfer") await page.keyboard.press("Shift+F");
    await page
      .getByRole("textbox", { name: mode === "fillet" ? "Fillet radius" : "Chamfer distance" })
      .fill("1");
    const preview = (await inspect(page)).preview;
    const broom = await settledBroom(page);
    assert.ok(await broom.isEnabled(), `${mode}: split supporting surfaces can be cleaned`);
    await broom.click();
    const accepted = (await inspect(page)).document;
    assert.ok(accepted.bodies[0].faces.length < preview.bodies[0].faces.length);
    assert.ok(Math.abs(accepted.bodies[0].volume - preview.bodies[0].volume) < 1e-6);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
}
