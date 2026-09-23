import assert from "node:assert/strict";
import { at, click, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function clickGuide(page, index = 0) {
  const box = await page.locator(".bow-handle").nth(index).boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
function arcs(document, original, radius) {
  const curves = document.sketches[0].curves;
  for (const [i, curve] of curves.entries()) {
    assert.equal(curve.kind, "arc");
    assert.deepEqual(curve.a, original.sketches[0].curves[i].a);
    assert.deepEqual(curve.b, original.sketches[0].curves[i].b);
    close(
      (Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) * (1 + curve.bulge ** 2)) /
        (4 * Math.abs(curve.bulge)),
      radius,
    );
  }
}
export async function jointBowRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [8, 0], [0, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 12], [14, 12]);
  await page.keyboard.down("Shift");
  await click(page, 2, 0);
  await page.keyboard.up("Shift");
  const original = (await inspect(page)).document;
  assert.equal(await page.locator(".bow-handle").count(), 4);
  assert.equal(await page.locator(".bow-guide").count(), 4);
  await page.keyboard.press("m");
  assert.equal(await page.locator(".bow-handle").count(), 0);
  assert.equal(await page.locator('[data-move-marker="x"], [data-move-marker="y"]').count(), 2);
  await page.keyboard.press("v");
  const handle = await page.locator(".bow-handle").first().boundingBox();
  const target = await at(page, 8, 16);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  assert.equal(await page.locator(".bow-handle.bow-match").count(), 2);
  assert.equal(await page.locator(".bow-guide.bow-match").count(), 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  arcs((await inspect(page)).document, original, Math.sqrt(65));
  const bowed = (await inspect(page)).document.sketches[0].curves;
  assert.ok(
    bowed[0].bulge > 0 && bowed[1].bulge < 0,
    "Oppositely drawn parallel lines bow in the same physical direction",
  );
  assert.equal(await page.locator(".bow-handle").count(), 2);
  await clickGuide(page);
  const input = page.getByRole("textbox", { name: "Bow radius", exact: true });
  await input.fill("12");
  await page.keyboard.press("Enter");
  const edited = (await inspect(page)).document;
  arcs(edited, original, 12);
  await clickGuide(page);
  await input.fill("3");
  await page.keyboard.press("Enter");
  assert.deepEqual(
    (await inspect(page)).document,
    edited,
    "Invalid radius changes none of the arcs",
  );
  await page.keyboard.press("Escape");
  await inspect(page);
  await clickGuide(page);
  await input.fill("18");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, edited);
  await chooseTool(page, "undo", "undo");
  arcs((await inspect(page)).document, original, Math.sqrt(65));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  arcs((await inspect(page)).document, original, Math.sqrt(65));
  await rectangleBow(page, name);
  console.log(
    `${name}: multi-edge guide/drag/type, fixed endpoints, shared radius, re-edit, reject/cancel and atomic history passed`,
  );
}
async function rectangleBow(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const original = (await inspect(page)).document;
  assert.equal(await page.locator(".bow-handle").count(), 8);
  const guide = await page.locator(".bow-handle").nth(3).boundingBox();
  await page.mouse.move(guide.x + guide.width / 2, guide.y + guide.height / 2);
  assert.equal(await page.locator(".bow-handle.bow-match").count(), 4);
  assert.equal(await page.locator(".bow-guide.bow-match").count(), 4);
  await page.screenshot({ path: `.cache/sketch-review/${name}-bow-direction-hover.png` });
  await clickGuide(page, 3); // Positive-side guide of a shorter rectangle edge.
  await page.getByRole("textbox", { name: "Bow radius", exact: true }).fill("15");
  await page.keyboard.press("Enter");
  const result = (await inspect(page)).document;
  arcs(result, original, 15);
  assert.ok(
    result.sketches[0].curves.every((c) => c.bulge < 0),
    "Nearest guide determines the chosen side",
  );
  assert.equal(result.sketches[0].groups.length, 0);
  assert.equal((await inspect(page)).selectedCurves.length, 4);
  await page.screenshot({ path: `.cache/sketch-review/${name}-joint-bow.png` });
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
