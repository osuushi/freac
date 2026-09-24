import assert from "node:assert/strict";
import { pixels } from "./ui-fill.mjs";
import { click, drag, inspect, inspectPointChoices, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function pointGroupsRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const start of [
    [-8, -4],
    [-4, 12],
  ]) {
    await page.keyboard.press("l");
    await drag(page, start, [4, 6], ["Shift"]);
  }
  await page.keyboard.press("v");
  await click(page, 4, 6);
  const menu = page.getByRole("group", { name: "Choose coincident points" });
  const choices = menu.locator("button[data-point-key]");
  const unfuse = page.getByRole("button", { name: "Unfuse selected points", exact: true });
  const fuse = page.getByRole("button", { name: "Fuse selected points", exact: true });
  assert.equal(await choices.count(), 2);
  assert.equal(await unfuse.count(), 0, "Unlinked fixture has no Unfuse");
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await drag(page, [4, 6], [16, 4], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 4, 6);
  await choices.nth(0).click();
  await choices.nth(1).click({ modifiers: ["Shift"] });
  await fuse.click();
  await inspect(page);
  assert.equal(await choices.count(), 2, "Mixed fixture has one fused and one independent choice");
  assert.equal(await choices.nth(0).locator("polyline").count(), 2);
  assert.equal(await choices.nth(1).locator("polyline").count(), 1);
  await choices.nth(1).click();
  assert.equal(await unfuse.count(), 0, "Independent choice cannot be unfused");
  await groupedHover(page, choices.nth(0));
  await choices.nth(0).click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).pointChoice.length, 3);
  await choices.nth(0).click({ modifiers: ["ControlOrMeta"] });
  assert.equal((await inspect(page)).pointChoice.length, 1);
  await choices.nth(0).click({ modifiers: ["ControlOrMeta"] });
  assert.equal((await inspect(page)).pointChoice.length, 3);
  await choices.nth(0).click();
  assert.equal((await inspect(page)).pointChoice.length, 2);
  assert.equal(await choices.nth(0).getAttribute("aria-pressed"), "true");
  assert.equal(await choices.nth(1).getAttribute("aria-pressed"), "false");
  await page.screenshot({ path: `.cache/sketch-review/${name}-point-groups.png` });
  await page.keyboard.press("Escape");
  await drag(page, [4, 6], [6, 8], ["Shift"]);
  const moved = (await inspect(page)).document.sketches[0].curves;
  pointEquals(moved[0].b, [6, 8]);
  pointEquals(moved[1].b, [6, 8]);
  pointEquals(moved[2].a, [4, 6]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 4, 6);
  await inspectPointChoices(page, 4, 6);
  await choices.nth(0).click();
  await unfuse.click();
  await inspect(page);
  assert.equal(await choices.count(), 3);
  assert.equal(await unfuse.count(), 0);
  await fuse.click();
  await inspect(page);
  assert.equal(await choices.count(), 2);
  console.log(
    `${name}: unfused/mixed fixtures, grouped diagrams, modifiers, move, Unfuse/Fuse and Undo passed`,
  );
}

async function groupedHover(page, choice) {
  const points = [
    [2.8, 5],
    [2.4, 7.2],
  ];
  const before = await pixels(page, points);
  await choice.hover();
  const after = await pixels(page, points, false);
  for (let i = 0; i < points.length; i++)
    assert.ok(
      after[i][0] - after[i][2] > before[i][0] - before[i][2] + 10,
      `Both fused branches highlight on hover: ${before[i]} -> ${after[i]}`,
    );
}
