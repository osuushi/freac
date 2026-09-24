import assert from "node:assert/strict";
import { at, click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function axisTip(page, axis) {
  const box = await page.locator(`[data-move-marker="${axis}"] > svg`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
function translated(before, after, dx, dy) {
  for (const curve of before.curves) {
    const current = after.curves.find((c) => c.id === curve.id);
    for (const end of curve.kind === "circle" ? ["center"] : ["a", "b"])
      pointEquals(current[end], [curve[end].x + dx, curve[end].y + dy]);
    if (curve.kind === "circle") assert.equal(current.radius, curve.radius);
    if (curve.kind === "arc") assert.equal(current.bulge, curve.bulge);
  }
}
export async function transformRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [-20, -10], [-10, -10]);
    await page.getByRole("button", { name: "Constrain horizontal", exact: true }).click();
    await page.keyboard.press("l");
    await drag(page, [10, 10], [20, 10]);
    await page.keyboard.press("Escape");
    await click(page, -16, -10);
    await page.keyboard.down("Shift");
    await click(page, 14, 10);
    await page.keyboard.up("Shift");
    assert.equal((await inspect(page)).selection.length, 2);
    const before = (await inspect(page)).document.sketches[0];
    let tip = await axisTip(page, "x");
    await page.mouse.click(tip.x, tip.y);
    const xInput = page.getByRole("textbox", { name: `Move ${plane[0]}`, exact: true });
    await xInput.waitFor();
    assert.ok(await xInput.evaluate((input) => input === document.activeElement));
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    translated(before, (await inspect(page)).document.sketches[0], 3, 0);
    assert.equal(await xInput.inputValue(), "0", "Accepted movement resets the next distance");
    tip = await axisTip(page, "y");
    const origin = await at(page, 0, 0),
      target = await at(page, 0, 4);
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down();
    await page.mouse.move(tip.x + target.x - origin.x, tip.y + target.y - origin.y, { steps: 8 });
    await page.mouse.up();
    translated(before, (await inspect(page)).document.sketches[0], 3, 4);
    await chooseTool(page, "undo", "undo");
    translated(before, (await inspect(page)).document.sketches[0], 3, 0);
    await chooseTool(page, "redo", "redo");
    translated(before, (await inspect(page)).document.sketches[0], 3, 4);
    await click(page, -13, -6);
    await page.keyboard.down("Shift");
    await click(page, 17, 14);
    await page.keyboard.up("Shift");
    const ring = (await inspect(page)).rotationHandle;
    await page.mouse.click(ring.x, ring.y);
    const angle = page.getByRole("textbox", { name: "Angle", exact: true });
    assert.ok(await angle.evaluate((input) => input === document.activeElement));
    await page.keyboard.type("45");
    await page.keyboard.press("Enter");
    translated(before, (await inspect(page)).document.sketches[0], 3, 4);
    assert.equal(
      await angle.getAttribute("aria-invalid"),
      "true",
      "Rotation conflicting with a horizontal constraint rejects instead of deforming",
    );
    tip = await axisTip(page, "x");
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down();
    await page.mouse.move(tip.x + 40, tip.y, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    translated(before, (await inspect(page)).document.sketches[0], 3, 4);
    await page.screenshot({ path: `.cache/sketch-review/${name}-transform-${plane}.png` });
  }
  await smallArcLayout(page, name);
  console.log(
    `${name}: transform arrows, numeric translation, axis drag, Undo/Redo and Escape on XY/XZ/YZ passed`,
  );
}

async function smallArcLayout(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-4, 0], [4, 0]);
  await page.locator(".bow-handle").nth(1).waitFor({ state: "visible" });
  const guide = await page.locator(".bow-handle").nth(1).boundingBox();
  const target = await at(page, 0, 2);
  await page.mouse.move(guide.x + guide.width / 2, guide.y + guide.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  const radius = page.getByRole("textbox", { name: "Radius", exact: true });
  const pivot = page.getByRole("button", { name: "Place rotation pivot" });
  const a = await radius.locator("..").boundingBox(),
    b = await pivot.boundingBox();
  assert.ok(
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
    "Small-arc Radius and Pivot remain separate",
  );
  await radius.click();
  assert.ok(await radius.evaluate((input) => input === document.activeElement));
  await page.keyboard.press("Escape");
  await pivot.click();
  await click(page, 0, 0);
  pointEquals((await inspect(page)).pivot, [0, 0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-small-arc-layout.png` });
  await page.keyboard.press("c");
  await drag(page, [-15, 0], [-12, 0]);
  await page.keyboard.press("l");
  await drag(page, [10, 0], [15, 0]);
  await page.keyboard.press("v");
  await drag(page, [-20, 10], [20, -10]);
  assert.equal((await inspect(page)).selection.length, 3);
  const before = (await inspect(page)).document.sketches[0];
  const tip = await axisTip(page, "y");
  await page.mouse.click(tip.x, tip.y);
  await page.keyboard.type("-2");
  await page.keyboard.press("Enter");
  translated(before, (await inspect(page)).document.sketches[0], 0, -2);
}
