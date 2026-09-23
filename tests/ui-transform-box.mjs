import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
async function center(locator) {
  await locator.waitFor({ state: "visible" });
  const b = await locator.boundingBox();
  assert.ok(b);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function resize(page, key, dx, dy) {
  const p = await center(page.locator(`.transform-box-handle[data-handle="${key}"]`));
  await page.keyboard.down("Shift");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  return inspect(page);
}
async function accept(page) {
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  return inspect(page);
}
export async function transformBoxRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await chooseTool(page, "transform", "transform");
  assert.equal(await page.locator("[data-move-marker=x]").count(), 1);
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  let state = await inspect(page);
  const before = state.document;
  close(state.preview.sketches[0].curves[0].a.x, -10);
  await page.getByRole("textbox", { name: "Transform scale Y", exact: true }).fill("3");
  state = await accept(page);
  close(state.document.sketches[0].curves[0].a.x, -10);
  close(state.document.sketches[0].curves[0].a.y, -10);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  await page.keyboard.press("m");
  const anchor = await center(
    page.getByRole("button", { name: "Reposition sketch pivot", exact: true }),
  );
  const target = await at(page, -10, -10);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  const a = await at(page, 0, 0),
    b = await at(page, 20, 0);
  state = await resize(page, "1,0,0", b.x - a.x, b.y - a.y);
  close(state.preview.sketches[0].curves[0].a.x, -10);
  close(state.preview.sketches[0].curves[0].b.x, 50);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).preview, null);
  const diagonal = await at(page, 10, 10);
  state = await resize(page, "1,1,0", diagonal.x - a.x, diagonal.y - a.y);
  const endpoints = state.preview.sketches[0].curves.flatMap((c) => [c.a, c.b]);
  close(Math.max(...endpoints.map((p) => p.x)), 40);
  close(Math.max(...endpoints.map((p) => p.y)), 30);
  await page.keyboard.press("Escape");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-transform-box.png` });
  await curvedRoute(page);
  console.log(
    `${name}: combined arrows/box, anchor/edge drag, circle/arc conversion, cubic editing and history passed`,
  );
}
async function curvedRoute(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  let state = await accept(page);
  assert.ok(state.document.sketches[0].curves.every((c) => c.kind === "bezier"));
  const converted = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, converted);
  await page.keyboard.press("v");
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("m");
  assert.ok(await page.locator(".transform-box-handle").count());
  const first = converted.sketches[0].curves[0];
  await page.keyboard.press("v");
  const empty = await at(page, -25, -20);
  await page.mouse.click(empty.x, empty.y);
  const midpoint = {
    x: (first.a.x + 3 * first.c1.x + 3 * first.c2.x + first.b.x) / 8,
    y: (first.a.y + 3 * first.c1.y + 3 * first.c2.y + first.b.y) / 8,
  };
  const focus = await at(page, midpoint.x, midpoint.y);
  await page.mouse.move(focus.x, focus.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -140);
  await page.keyboard.up("Control");
  await inspect(page);
  const pick = await at(
    page,
    0.421875 * first.a.x + 0.421875 * first.c1.x + 0.140625 * first.c2.x + 0.015625 * first.b.x,
    0.421875 * first.a.y + 0.421875 * first.c1.y + 0.140625 * first.c2.y + 0.015625 * first.b.y,
  );
  await page.mouse.click(pick.x, pick.y);
  const control = await center(page.locator(`[data-handle="c1"][data-curve="${first.id}"]`));
  await page.keyboard.down("Shift");
  await page.mouse.move(control.x, control.y);
  await page.mouse.down();
  await page.mouse.move(control.x + 15, control.y - 15, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert.notDeepEqual((await inspect(page)).document.sketches[0].curves[0].c1, first.c1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, converted);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("l");
  await drag(page, [-10, 0], [10, 0]);
  const guide = await center(page.locator(".bow-handle").first());
  const bowed = await at(page, 0, -5);
  await page.mouse.move(guide.x, guide.y);
  await page.mouse.down();
  await page.mouse.move(bowed.x, bowed.y, { steps: 8 });
  await page.mouse.up();
  const arc = (await inspect(page)).document;
  assert.equal(arc.sketches[0].curves[0].kind, "arc");
  await page.keyboard.press("m");
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  state = await accept(page);
  assert.ok(state.document.sketches[0].curves.every((c) => c.kind === "bezier"));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, arc);
}
