import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Real BrowserWindow → IPC → preload → renderer boundary; native packets are
// emitted by this test, so physical macOS gesture delivery still needs review.
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 850 });
  await inspect(page);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("Escape");
  const before = await inspect(page),
    history = await page.evaluate(() => window.makeshiftHistory());
  await page.evaluate(() => {
    window.rotationEvents = 0;
    window.makeshiftNavigation.onRotate(() =>
      requestAnimationFrame(() => {
        window.rotationEvents++;
      }),
    );
  });
  const rotate = async (degrees) => {
    const count = await page.evaluate(() => window.rotationEvents);
    await app.evaluate(({ BrowserWindow }, degrees) => {
      BrowserWindow.getAllWindows()[0].emit("rotate-gesture", {}, degrees);
    }, degrees);
    await page.waitForFunction((count) => window.rotationEvents > count, count);
    return inspect(page);
  };
  const anchor = { x: 950, y: 600 };
  await page.mouse.move(anchor.x, anchor.y);
  assert.deepEqual((await rotate(-8)).camera.up, before.camera.up, "Small twist does not turn");
  const turned = await rotate(-8); // Native negative is clockwise; crossing 15° turns 90°.
  const x = before.projection.origin.x - anchor.x,
    y = before.projection.origin.y - anchor.y;
  assert.ok(Math.abs(turned.projection.origin.x - (anchor.x - y)) < 1e-6);
  assert.ok(Math.abs(turned.projection.origin.y - (anchor.y + x)) < 1e-6);
  assert.equal(turned.activePlane, "XY");
  assert.deepEqual((await rotate(-45)).camera.up, turned.camera.up, "One turn per gesture");
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -25);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height < height,
    before.camera.height,
  );
  assert.deepEqual(
    (await inspect(page)).camera.up,
    turned.camera.up,
    "Pinch stays continuous alongside quarter turn",
  );
  // No terminal event: idle must rearm and settle the next gesture too.
  await page.waitForTimeout(550);
  await inspect(page);
  const reverse = await rotate(16);
  before.camera.up.forEach((v, i) => {
    assert.ok(Math.abs(v - reverse.camera.up[i]) < 1e-8);
  });
  await rotate(0);
  await page.waitForTimeout(550);
  const settled = await inspect(page);
  assert.deepEqual(settled.document, before.document);
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
  await page.getByTitle("Controls", { exact: true }).hover();
  assert.deepEqual((await rotate(-20)).camera, settled.camera, "UI hover does not turn");
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(anchor.x + 30, anchor.y + 25);
  const orbit = await inspect(page);
  assert.deepEqual((await rotate(-20)).camera, orbit.camera, "Orbit excludes native twist");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.mouse.move(anchor.x, anchor.y);
  const oblique = await rotate(-16);
  await page.waitForFunction((up) => {
    const c = window.makeshiftInspect().camera;
    return !c.moving && c.up.some((v, i) => Math.abs(v - up[i]) > 1e-6);
  }, oblique.camera.up);
  const snapped = await inspect(page);
  assert.notDeepEqual(
    snapped.camera.up,
    oblique.camera.up,
    "Oblique quarter turn snaps without end event",
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const start = await at(page, 30, 0),
    end = await at(page, 40, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  const editing = await inspect(page);
  assert.deepEqual((await rotate(-20)).camera, editing.camera, "Drawing excludes twist");
  await page.mouse.up();
  const done = await inspect(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.deepEqual((await rotate(-20)).camera, done.camera, "Blur clears gesture");
  console.log(
    "Hidden Electron: 15° threshold, one 90° turn, direction/anchor, pinch coexistence, idle rearm/snap and input guards passed",
  );
} finally {
  await app.close();
}
