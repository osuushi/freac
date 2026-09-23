import assert from "node:assert/strict";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function selectPair(page, first, second) {
  await page.keyboard.press("v");
  await click(page, ...first);
  await page.keyboard.down("Shift");
  await click(page, ...second);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selectedCurves.length, 2);
}
export async function bowDirectionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-20, -10], [-10, -10]);
  await drag(page, [10, -10], [10, 10]);
  await selectPair(page, [-17, -10], [10, -5]);
  assert.equal(
    await page.locator(".bow-handle").count(),
    0,
    "Open nonparallel selection has no joint bow",
  );
  await click(page, -25, 15);
  await click(page, -17, -10);
  assert.equal(await page.locator(".bow-handle").count(), 2, "Single edge keeps its bow controls");

  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-25, -10], [-5, 10]);
  await page.keyboard.press("r");
  await drag(page, [5, -10], [25, 10]);
  await selectPair(page, [-20, -10], [25, -5]);
  const original = (await inspect(page)).document;
  assert.equal(await page.locator(".bow-handle").count(), 4);
  const guide = await page.locator(".bow-handle").first().boundingBox();
  await page.mouse.move(guide.x + guide.width / 2, guide.y + guide.height / 2);
  assert.equal(await page.locator(".bow-handle.bow-match").count(), 2);
  await page.mouse.click(guide.x + guide.width / 2, guide.y + guide.height / 2);
  await page.getByRole("textbox", { name: "Bow radius", exact: true }).fill("15");
  await page.keyboard.press("Enter");
  const changed = (await inspect(page)).document.sketches[0].curves;
  const arcs = changed.filter((c) => c.kind === "arc");
  assert.equal(arcs.length, 2);
  assert.ok(
    arcs.every((c) => c.bulge > 0),
    "Both separate regions bow outward",
  );
  for (const arc of arcs) {
    const before = original.sketches[0].curves.find((c) => c.id === arc.id);
    assert.deepEqual(arc.a, before.a);
    assert.deepEqual(arc.b, before.b);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);

  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  await page.keyboard.press("l");
  await drag(page, [-10, -10], [10, 10]);
  await selectPair(page, [-5, -10], [-5, -5]);
  assert.equal(
    await page.locator(".bow-handle").count(),
    0,
    "An edge shared by two bounded regions is ambiguous",
  );
  console.log(
    `${name}: open/dividing-edge eligibility, separate-region direction and hover passed`,
  );
}
