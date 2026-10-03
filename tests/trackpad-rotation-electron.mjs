import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { assertSmoothRoll, recordRoll } from "./ui-roll-animation.mjs";
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
  const rotate = async (degrees, settle = true) => {
    const count = await page.evaluate(() => window.rotationEvents);
    await app.evaluate(({ BrowserWindow }, degrees) => {
      BrowserWindow.getAllWindows()[0].emit("rotate-gesture", {}, degrees);
    }, degrees);
    await page.waitForFunction((count) => window.rotationEvents > count, count);
    return settle ? inspect(page) : page.evaluate(() => window.makeshiftInspect());
  };
  const anchor = { x: 950, y: 600 };
  await page.mouse.move(anchor.x, anchor.y);
  assert.deepEqual((await rotate(-8)).camera.up, before.camera.up, "Small twist does not turn");
  await recordRoll(page);
  const starting = await rotate(-8, false);
  assert.equal(starting.camera.moving, true, "Threshold starts animation");
  await rotate(-45, false); // Continued packets must not cancel or restart the animation.
  await rotate(0, false); // An early end must let the animation finish.
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -25);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height < height,
    before.camera.height,
  );
  const turned = await inspect(page);
  await assertSmoothRoll(page, before, Math.PI / 2);
  const scale = before.camera.height / turned.camera.height;
  const x = (before.projection.origin.x - anchor.x) * scale,
    y = (before.projection.origin.y - anchor.y) * scale;
  assert.ok(Math.abs(turned.projection.origin.x - (anchor.x - y)) < 1e-6);
  assert.ok(Math.abs(turned.projection.origin.y - (anchor.y + x)) < 1e-6);
  assert.equal(turned.activePlane, "XY");
  // A later gesture can turn back in the opposite direction.
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
  const oblique = await inspect(page);
  await recordRoll(page);
  await rotate(-16, false);
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
  await assertSmoothRoll(page, oblique);
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
  await page.mouse.move(anchor.x, anchor.y);
  await rotate(0);
  await rotate(-20, false);
  await page.keyboard.press("Escape");
  const cancelled = await inspect(page);
  await page.waitForTimeout(350);
  assert.deepEqual((await inspect(page)).camera, cancelled.camera, "Escape stops the animation");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await rotate(0);
  const reduced = await rotate(20);
  assert.notDeepEqual(reduced.camera.up, cancelled.camera.up, "Reduced motion still turns");
  assert.equal(reduced.camera.moving, false);
  console.log(
    "Hidden Electron: smooth snapped turns, early end, pinch coexistence, cancellation, reduced motion and input guards passed",
  );
} finally {
  await app.close();
}
