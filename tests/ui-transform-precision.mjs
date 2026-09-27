import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function center(locator) {
  const box = await locator.boundingBox();
  assert.ok(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

export async function transformPrecisionRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  const status = await page.getByRole("status").textContent();
  const step = Number(status.match(/([\d.]+) mm grid/)[1]);
  const arrow = await center(page.locator('[data-move-marker="x"] > svg'));
  const zero = await at(page, 0, 0),
    one = await at(page, 1, 0);
  await page.mouse.move(arrow.x, arrow.y);
  await page.mouse.down();
  await page.mouse.move(arrow.x + 2.3 * step * (one.x - zero.x), arrow.y, { steps: 8 });
  const displacement = async () => {
    const state = await inspect(page);
    return (
      (state.preview ?? state.document).sketches[0].curves.at(-4).a.x -
      original.sketches[0].curves[0].a.x
    );
  };
  close(await displacement(), 2 * step);
  await page.keyboard.down("Shift");
  close(await displacement(), 2.3 * step);
  await page.keyboard.down("Alt");
  close(await displacement(), 2.3 * step);
  assert.equal((await inspect(page)).preview.sketches[0].curves.length, 8);
  await page.keyboard.up("Alt");
  close(await displacement(), 2.3 * step);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  close(await displacement(), 2.3 * step);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await chooseTool(page, "transform", "transform");
  await uniformScale(page, (await inspect(page)).document);
  await scaleAfterNonuniform(page);
  console.log(
    `${name}: fine move grid, Option copy, Shift scale 0.1, accepted geometry and Undo passed`,
  );
}

async function uniformScale(page, original) {
  const handle = await center(page.locator(".transform-box-handle:visible").last());
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 37, handle.y - 23, { steps: 8 });
  await page.keyboard.down("Shift");
  const input = page.getByLabel("Transform scale X", { exact: true });
  await inspect(page);
  const factor = Number(await input.inputValue());
  assert.ok(factor > 1);
  close(factor * 10, Math.round(factor * 10));
  close(Number(await page.getByLabel("Transform scale Y", { exact: true }).inputValue()), factor);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const state = await inspect(page);
  const a = state.preview.sketches[0].curves[0];
  const b = original.sketches[0].curves[0];
  close(
    Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y),
    factor * Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y),
  );
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}

async function scaleAfterNonuniform(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await chooseTool(page, "transform", "transform");
  const original = (await inspect(page)).document;
  await page.locator(".transform-box-handle:visible").last().click();
  const x = page.getByLabel("Transform scale X", { exact: true });
  const y = page.getByLabel("Transform scale Y", { exact: true });
  await x.fill("1.23");
  const numeric = (await inspect(page)).preview.sketches[0].curves[0];
  const before = original.sketches[0].curves[0];
  close(numeric.b.x - numeric.a.x, 1.23 * (before.b.x - before.a.x));
  const handle = await center(page.locator(".transform-box-handle:visible").last());
  await page.keyboard.down("Shift");
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 37, handle.y - 23, { steps: 8 });
  await inspect(page);
  const sx = Number(await x.inputValue()),
    sy = Number(await y.inputValue());
  close(sx * 10, Math.round(sx * 10));
  close(sx / sy, 1.23);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}

export async function transformDeleteRoute(page, name) {
  await chooseTool(page, "select", "select");
  const original = (await inspect(page)).document;
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  const removed = (await inspect(page)).document;
  assert.equal(removed.sketches.flatMap((sketch) => sketch.curves).length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, removed);
  await reset(page);
  assert.equal((await inspect(page)).document.sketches.length, 0);
  console.log(`${name}: transform exit, Select All/Delete, Undo/Redo and new document passed`);
}
