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
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if (String((await inspect(page)).gridSnap) === "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-10, 0]);
  const initialLine = (await inspect(page)).document.sketches[0].curves[0];
  await page.keyboard.press("v");
  await click(page, initialLine.a.x, initialLine.a.y);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  let line = (await inspect(page)).document.sketches[0].curves[0];
  translated(line.a, initialLine.a, 3, 0);
  pointEquals(line.b, [initialLine.b.x, initialLine.b.y]);
  await pointAxisDrag(page);
  await chooseTool(page, "undo", "undo");
  await inspect(page);

  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, initialLine.a.x + 3, initialLine.a.y);
  await page.getByRole("button", { name: "Transform (M)", exact: true }).click();
  await axisValue(page, "y", 4);
  line = (await inspect(page)).document.sketches[0].curves[0];
  translated(line.a, initialLine.a, 0, 4);
  translated(line.b, initialLine.b, 0, 4);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await page.keyboard.press("c");
  await drag(page, [10, 10], [14, 10]);
  const initialCircle = (await inspect(page)).document.sketches[0].curves[1];
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
  translated(
    (await inspect(page)).document.sketches[0].curves[1].center,
    initialCircle.center,
    2,
    0,
  );
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
    if (!(await inspect(page)).moveMode) await page.keyboard.press("m");
    await axisValue(page, "y", 2);
    const result = (await inspect(page)).document.sketches[0];
    translated(result.curves[0].a, initialLine.a, 0, 2);
    translated(result.curves[1].center, initialCircle.center, 0, 2);
    await chooseTool(page, "undo", "undo");
    await inspect(page);
  }
  await click(page, 25, -20);
  await click(page, initialLine.a.x + 3, initialLine.a.y);
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
  const [line, circle] = before.sketches[0].curves;
  const pivot = {
    x:
      (Math.min(line.a.x, circle.center.x - circle.radius) +
        Math.max(line.a.x, circle.center.x + circle.radius)) /
      2,
    y:
      (Math.min(line.a.y, circle.center.y - circle.radius) +
        Math.max(line.a.y, circle.center.y + circle.radius)) /
      2,
  };
  const rotated = (point) => [pivot.x - (point.y - pivot.y), pivot.y + point.x - pivot.x];
  pointEquals(curves[0].a, rotated(line.a));
  pointEquals(curves[0].b, [line.b.x, line.b.y]);
  pointEquals(curves[1].center, rotated(circle.center));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}
async function rectangleMove(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if (String((await inspect(page)).gridSnap) === "true")
    await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const initial = await corners(page);
  await page.keyboard.press("v");
  await click(page, 10, -2);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  pointEquals((await corners(page))[0], [initial[0].x, initial[0].y]);
  translated((await corners(page))[2], initial[2], 3, 0);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 1, 1);
  await page.keyboard.press("m");
  await axisValue(page, "x", 3);
  translated((await corners(page))[0], initial[0], 3, 0);
  translated((await corners(page))[2], initial[2], 3, 0);
}

async function pointAxisDrag(page) {
  const enabled = String((await inspect(page)).gridSnap) === "true";
  if (enabled) await chooseTool(page, "grid snap", "grid");
  const tip = await markerCenter(page, "y");
  const origin = await at(page, 0, 0),
    target = await at(page, 0, 3);
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  const before = (await inspect(page)).document.sketches[0].curves[0];
  await page.mouse.move(tip.x + target.x - origin.x, tip.y + target.y - origin.y, { steps: 8 });
  await page.mouse.up();
  const line = (await inspect(page)).document.sketches[0].curves[0];
  assert.ok(Math.abs(line.a.y - before.a.y - 3) < 0.1);
  pointEquals(line.a, [before.a.x, line.a.y]);
  pointEquals(line.b, [before.b.x, before.b.y]);
  if (enabled) await chooseTool(page, "grid snap", "grid");
}

function translated(actual, before, dx, dy) {
  pointEquals(actual, [before.x + dx, before.y + dy]);
}

async function markerCenter(page, axis) {
  const marker = page.locator(`[data-move-marker="${axis}"] > svg`);
  await marker.waitFor({ state: "visible" });
  const box = await marker.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
