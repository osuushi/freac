import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function orientationCubeRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  assert.equal(before.document.sketches.length, 1, "Rectangle creation reaches the real solver");
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  assert.equal((await inspect(page)).activePlane, null);
  const history = await page.evaluate(() => window.freacHistory());
  const cube = page.locator(".orientation-cube");
  const bounds = await cube.boundingBox();
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const tools = await page.getByRole("button", { name: /Tools/ }).first().boundingBox();
  assert.ok(tools.x + tools.width < bounds.x, "Tools does not overlap the cube");
  const normals = {
    Front: [0, -1, 0],
    Back: [0, 1, 0],
    Left: [-1, 0, 0],
    Right: [1, 0, 0],
    Top: [0, 0, 1],
    Bottom: [0, 0, -1],
  };
  for (const [face, normal] of Object.entries(normals)) {
    // Reveal hidden faces through actual cube drags, never by changing the camera directly.
    const target = page.getByRole("button", { name: `${face} view`, exact: true });
    for (let attempt = 0; attempt < 16 && !(await target.locator("text").isVisible()); attempt++) {
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + 27, center.y + (attempt % 2 ? -24 : 20), { steps: 6 });
      await page.mouse.up();
      await inspect(page);
    }
    await target.locator("polygon").click();
    const state = await inspect(page);
    const offset = state.camera.position.map((v, i) => v - state.camera.target[i]);
    const distance = Math.hypot(...offset);
    offset.forEach((v, i) => {
      assert.ok(Math.abs(v / distance - normal[i]) < 1e-8);
    });
    assert.deepEqual(state.camera.target, before.camera.target);
    assert.equal(state.camera.height, before.camera.height);
    assert.deepEqual(state.document, before.document);
  }
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 35, center.y + 25, { steps: 6 });
  assert.equal((await inspect(page)).camera.orbitActive, true);
  await page.keyboard.press("Escape");
  const canceled = await inspect(page);
  await page.mouse.up();
  assert.equal(canceled.camera.orbitActive, false);
  assert.deepEqual((await inspect(page)).camera, canceled.camera);
  const visible = cube.locator('[role="button"]:visible').first();
  await visible.focus();
  await page.keyboard.press("Enter");
  await inspect(page);
  assert.deepEqual(await page.evaluate(() => window.freacHistory()), history);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 24, center.y + 18, { steps: 6 });
  await page.mouse.up();
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-orientation-cube.png` });
  console.log(
    `${name}: cube face alignment, drag, Escape, keyboard and unchanged geometry/history passed`,
  );
}
