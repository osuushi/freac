import assert from "node:assert/strict";
import { close, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function modalPointerHistory(page, center) {
  await page.mouse.click(center.x + 30, center.y + 30);
  await chooseTool(page, "shell", "shell");
  const input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await input.fill("-1");
  const original = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Shell thickness handle", exact: true });
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((button) => ({
    x: Number(button.dataset.directionX),
    y: Number(button.dataset.directionY),
  }));
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - direction.x * 18, y - direction.y * 18, { steps: 5 });
  await page.mouse.up();
  const volume = (await inspect(page)).preview.bodies[0].volume;
  assert.ok(Math.abs(volume - 1084) > 1);
  await page.keyboard.press("Meta+z");
  let state = await inspect(page);
  close(state.preview.bodies[0].volume, 1084);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Meta+z");
  state = await inspect(page);
  assert.ok(state.preview === null);
  await page.keyboard.press("Meta+Shift+z");
  await inspect(page);
  await page.keyboard.press("Meta+Shift+z");
  close((await inspect(page)).preview.bodies[0].volume, volume);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}

export async function cancelModalAxisGesture(page) {
  const handle = page.getByRole("button", { name: "Position extrusion axis", exact: true });
  const before = await handle.boundingBox();
  const x = before.x + before.width / 2,
    y = before.y + before.height / 2;
  await page.keyboard.down("Meta");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 15, { steps: 4 });
  const moved = await handle.boundingBox();
  assert.ok(Math.hypot(moved.x - before.x, moved.y - before.y) > 1);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await inspect(page);
  const after = await handle.boundingBox();
  close(after.x, before.x);
  close(after.y, before.y);
}
