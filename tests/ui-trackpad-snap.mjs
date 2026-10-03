import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function tilt(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const upright = (await inspect(page)).camera.up;
  await page.mouse.move(900, 600);
  await page.keyboard.down("Meta");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(960, 600, { steps: 3 });
  await page.keyboard.press("Escape"); // Leave a tilted view through ordinary cancellation.
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
  const rolled = await inspect(page);
  assert.notDeepEqual(rolled.camera.up, upright);
  return { upright, rolled };
}
async function pinch(page) {
  const before = (await inspect(page)).camera.height;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -8);
  await page.keyboard.up("Control");
  await page.waitForFunction((height) => window.makeshiftInspect().camera.height < height, before);
}
async function snapped(page, upright) {
  await page.waitForFunction((up) => {
    const camera = window.makeshiftInspect().camera;
    return !camera.moving && camera.up.every((v, i) => Math.abs(v - up[i]) < 1e-8);
  }, upright);
  return inspect(page);
}
function gesture(page, type, scale = 1) {
  return page.locator("canvas").evaluate(
    (canvas, { type, scale }) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale });
      canvas.dispatchEvent(event);
    },
    { type, scale },
  );
}
export async function trackpadSnapRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("Escape");
  const { upright, rolled } = await tilt(page);
  for (let i = 0; i < 4; i++) {
    await pinch(page);
    await page.waitForTimeout(60);
    assert.deepEqual(
      (await inspect(page)).camera.up,
      rolled.camera.up,
      "Continued pinch postpones snap",
    );
  }
  const after = await snapped(page, upright);
  assert.deepEqual(after.document, rolled.document);
  const canceled = await tilt(page);
  await pinch(page);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  const pressed = await inspect(page);
  await page.waitForTimeout(550);
  assert.deepEqual(
    (await inspect(page)).camera.up,
    pressed.camera.up,
    "New pointer gesture cancels delayed snap",
  );
  await page.mouse.up();
  await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).document, canceled.rolled.document);

  const safari = await tilt(page);
  await gesture(page, "gesturestart");
  await gesture(page, "gesturechange", 1.2);
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await inspect(page)).camera.up,
    safari.rolled.camera.up,
    "Held WebKit gesture does not snap during a pause",
  );
  await gesture(page, "gestureend", 1.2);
  assert.deepEqual((await snapped(page, safari.upright)).document, safari.rolled.document);
  console.log(
    `${name}: pinch idle snap, continued-input delay, pointer cancellation and held WebKit gesture passed`,
  );
}
