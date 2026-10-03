import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Exercise the actual BrowserWindow → IPC → preload → renderer boundary.
// Emitting the native event does not establish physical macOS gesture delivery.
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
  const before = await inspect(page);
  const history = await page.evaluate(() => window.makeshiftHistory());
  // Add an acknowledgement after the app subscription, so ignored events can be checked too.
  await page.evaluate(() => {
    window.rotationEvents = 0;
    window.makeshiftNavigation.onRotate(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.rotationEvents++;
        }),
      ),
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
  const rolled = await rotate(-30); // Electron negative means clockwise.
  const angle = Math.PI / 6;
  const x = before.projection.origin.x - anchor.x,
    y = before.projection.origin.y - anchor.y;
  assert.ok(
    Math.abs(rolled.projection.origin.x - (anchor.x + x * Math.cos(angle) - y * Math.sin(angle))) <
      1e-6,
  );
  assert.ok(
    Math.abs(rolled.projection.origin.y - (anchor.y + x * Math.sin(angle) + y * Math.cos(angle))) <
      1e-6,
  );
  assert.equal(rolled.activePlane, "XY");
  assert.equal(rolled.camera.height, before.camera.height);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -25);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height < height,
    rolled.camera.height,
  );
  const pinched = await inspect(page);
  assert.deepEqual(pinched.camera.up, rolled.camera.up);
  const reversed = await rotate(30);
  before.camera.up.forEach((v, i) => {
    assert.ok(Math.abs(v - reversed.camera.up[i]) < 1e-8);
  });
  assert.equal(reversed.camera.height, pinched.camera.height, "Twist and pinch remain independent");
  assert.deepEqual(reversed.document, before.document);
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
  await rotate(-30);
  const snapped = await rotate(0);
  before.camera.up.forEach((v, i) => {
    assert.ok(Math.abs(v - snapped.camera.up[i]) < 1e-8);
  });
  await page.getByTitle("Controls", { exact: true }).hover();
  assert.deepEqual((await rotate(-20)).camera, snapped.camera, "UI hover does not rotate viewport");
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(anchor.x + 20, anchor.y);
  const orbit = await inspect(page);
  assert.equal(orbit.camera.orbitActive, true);
  assert.deepEqual((await rotate(-20)).camera, orbit.camera, "Orbit excludes native twist");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const start = await at(page, 30, 0),
    end = await at(page, 40, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  const editing = await inspect(page);
  assert.deepEqual(
    (await rotate(-20)).camera,
    editing.camera,
    "Geometry gesture excludes native twist",
  );
  await page.mouse.up();
  const done = await inspect(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.deepEqual((await rotate(-20)).camera, done.camera, "Blur clears the pointer anchor");
  console.log(
    "Hidden Electron: native rotation sign/anchor, pinch coexistence, end, UI/orbit/edit/blur guards, unchanged document/history passed",
  );
} finally {
  await app.close();
}
