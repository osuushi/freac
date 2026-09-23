import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function focusLossRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("32");
  await blurAndReturn(page);
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  assert.equal(await width.inputValue(), "32");
  await page.keyboard.press("Escape");
  const pick = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const handle = page.getByRole("button", { name: "Drag extrusion", exact: true });
  const box = await handle.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 5 });
  await page.mouse.up();
  const before = await inspect(page);
  assert.equal(before.interaction.kind, "extrude");
  assert.ok(before.preview.bodies.length);
  await blurAndReturn(page);
  const after = await inspect(page);
  assert.equal(after.interaction.kind, "extrude");
  assert.deepEqual(after.preview, before.preview, "Released preview survives focus loss");
  assert.deepEqual(after.document, before.document, "Focus loss never accepts geometry");
  const input = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await input.fill("7");
  await blurAndReturn(page);
  close((await inspect(page)).preview.bodies[0].volume, 4200);
  assert.equal(await input.inputValue(), "7");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 4200);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, 4200);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  if (!(await input.isVisible())) await page.mouse.click(pick.x, pick.y);
  await input.fill("9");
  await blurAndReturn(page);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).preview, null);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await moveFocusRoutes(page, pick);
  await heldGestureRoute(page);
  console.log(
    `${name}: released extrusion, sketch/body placement, numeric entry, held-drag cancellation and history passed`,
  );
}

async function blurAndReturn(page) {
  // Exercise the browser event delivered by app switching without opening a visible app.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await inspect(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

async function moveFocusRoutes(page, pick) {
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await page.mouse.click(pick.x, pick.y);
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("10");
  const before = await inspect(page);
  await blurAndReturn(page);
  assert.equal((await inspect(page)).interaction.kind, "body-move");
  assert.deepEqual((await inspect(page)).preview, before.preview);
  await page.keyboard.press("Enter");
  close(
    (await inspect(page)).document.bodies[0].center[0],
    before.document.bodies[0].center[0] + 10,
  );

  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const inside = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(inside.x, inside.y);
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move sketch X", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation X", exact: true }).fill("5");
  await blurAndReturn(page);
  assert.equal((await inspect(page)).interaction.kind, "placement");
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.sketches[0].plane.origin[0], 5);
}

async function heldGestureRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const a = await at(page, -10, -5),
    b = await at(page, 10, 5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction, null);
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await drag(page, [-10, -5], [10, 5]);
  assert.equal((await inspect(page)).document.sketches.length, 1);
}
