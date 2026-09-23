import assert from "node:assert/strict";
import { at, click, corners, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function axisValue(page, axis, value) {
  const tip = await markerCenter(page, axis);
  await page.mouse.click(tip.x, tip.y);
  await page.keyboard.type(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function moveToolRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  if (String((await inspect(page)).gridSnap) === "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-10, 0]);
  await page.keyboard.press("v");
  await click(page, -20, 0);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  let line = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(line.a, [-17, 0]);
  pointEquals(line.b, [-10, 0]);
  await pointAxisDrag(page);
  await chooseTool(page, "undo", "undo");
  await inspect(page);

  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, -17, 0);
  await page.getByRole("button", { name: "Transform (M)", exact: true }).click();
  await axisValue(page, "y", 4);
  line = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(line.a, [-20, 4]);
  pointEquals(line.b, [-10, 4]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await page.keyboard.press("c");
  await drag(page, [10, 10], [14, 10]);
  await page.keyboard.press("v");
  await click(page, 12, 11);
  await page.keyboard.press("m");
  assert.equal(
    (await inspect(page)).moveMode,
    true,
    JSON.stringify({
      state: await inspect(page),
      focus: await page.evaluate(() => document.activeElement?.outerHTML),
    }),
  );
  await axisValue(page, "x", 2);
  pointEquals((await inspect(page)).document.sketches[0].curves[1].center, [12, 10]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  for (const modifier of ["Control", "Meta"]) {
    await click(page, 25, -20);
    await page.keyboard.press(`${modifier}+a`);
    const state = await inspect(page);
    assert.deepEqual(
      new Set(state.selectedCurves),
      new Set(state.document.sketches[0].curves.map((c) => c.id)),
    );
    await page.keyboard.press("m");
    await axisValue(page, "y", 2);
    const result = (await inspect(page)).document.sketches[0];
    pointEquals(result.curves[0].a, [-20, 2]);
    pointEquals(result.curves[1].center, [10, 12]);
    await chooseTool(page, "undo", "undo");
    await inspect(page);
  }
  await click(page, 25, -20);
  await click(page, -17, 0);
  const input = page.getByRole("textbox", { name: "Length", exact: true });
  await input.focus();
  await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+a`);
  assert.deepEqual(await input.evaluate((el) => [el.selectionStart, el.selectionEnd]), [
    0,
    (await input.inputValue()).length,
  ]);
  assert.equal((await inspect(page)).selection.length, 1);
  await mixedMoveRotation(page);
  await rectangleMove(page);
  console.log(
    `${name}: explicit Move/M for point, edge, circle and Select All; numeric transforms, Undo and input text selection passed`,
  );
}

async function mixedMoveRotation(page) {
  await page.keyboard.press("Escape");
  await click(page, -20, 0);
  await page.keyboard.down("Shift");
  await click(page, 12, 11);
  await page.keyboard.up("Shift");
  const before = (await inspect(page)).document;
  await page.keyboard.press("m");
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("90");
  await page.keyboard.press("Enter");
  const curves = (await inspect(page)).document.sketches[0].curves;
  pointEquals(curves[0].a, [4, -10]);
  pointEquals(curves[0].b, [-10, 0]);
  pointEquals(curves[1].center, [-6, 20]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
async function rectangleMove(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  if (String((await inspect(page)).gridSnap) === "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await page.keyboard.press("v");
  await click(page, 10, -2);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  pointEquals((await corners(page))[0], [-10, -5]);
  pointEquals((await corners(page))[2], [13, 5]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 1, 1);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  pointEquals((await corners(page))[0], [-7, -5]);
  pointEquals((await corners(page))[2], [13, 5]);
}

async function pointAxisDrag(page) {
  const enabled = String((await inspect(page)).gridSnap) === "true";
  if (enabled) await chooseTool(page, "grid snap", "grid");
  const tip = await markerCenter(page, "y");
  const origin = await at(page, 0, 0),
    target = await at(page, 0, 3);
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.move(tip.x + target.x - origin.x, tip.y + target.y - origin.y, { steps: 8 });
  await page.mouse.up();
  const line = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(line.a, [-17, 3]);
  pointEquals(line.b, [-10, 0]);
  if (enabled) await chooseTool(page, "grid snap", "grid");
}

async function markerCenter(page, axis) {
  const box = await page.locator(`[data-move-marker="${axis}"] > svg`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
