import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";

export async function trackballRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  const before = await inspect(page);
  const bounds = await page.locator("canvas").boundingBox();
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height * 0.9;
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 3 });
  const first = await inspect(page);
  const diagnostic = page.locator('[aria-label="Rotation grab diagnostic"]');
  assert.equal(await diagnostic.count(), 0);
  assert.equal(first.camera.orbitActive, true);
  await page.mouse.move(x, y - 60);
  const second = await inspect(page);
  assert.deepEqual(second.document, before.document, "Command drag cannot draw or edit");
  assert.deepEqual(second.modelingSelection, before.modelingSelection);
  assert.ok(Math.abs(second.camera.up[0]) < 1e-8);
  await page.screenshot({ path: `.cache/sketch-review/${name}-orbit.png` });
  // Releasing the modifier does not drop an already captured drag.
  await page.keyboard.up("Meta");
  await page.mouse.move(x, y - 80);
  const released = await inspect(page);
  await page.mouse.up();
  const ended = await inspect(page);
  for (let i = 0; i < 3; i++)
    assert.ok(
      Math.abs(ended.camera.position[i] - released.camera.position[i]) < 1e-8,
      "Leveling only rolls",
    );
  await page.mouse.move(x + 40, y - 90);
  assert.deepEqual((await inspect(page)).camera, ended.camera, "Release ends the grab");
  await page.waitForTimeout(300);
  assert.deepEqual(
    (await inspect(page)).camera,
    ended.camera,
    "No motion after leveling completes",
  );
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + 60, y - 90);
  await page.keyboard.press("Escape");
  const cancelled = await inspect(page);
  await page.mouse.move(x + 80, y - 90);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).camera, cancelled.camera, "Escape releases capture");
  await page.mouse.wheel(20, 10);
  await page.waitForTimeout(60);
  const panned = await inspect(page);
  assert.notDeepEqual(panned.camera.target, cancelled.camera.target);
  assert.equal(await diagnostic.isVisible(), false);
  assert.deepEqual(panned.document, before.document);
  await releaseLeveling(page, bounds);
  console.log(
    `${name}: Arcball retains start point and levels on release, isolates editing and ends on release/Escape`,
  );
}

async function releaseLeveling(page, bounds) {
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const r = Math.min(bounds.width, bounds.height) / 2;
  await page.mouse.move(x + r * 1.1, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(x + r * 1.1, y - r * 0.3, { steps: 4 });
  const before = await inspect(page);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const immediate = await page.evaluate(() => window.freacInspect().camera);
  assert.equal(immediate.moving, true, "Mouse-up starts leveling animation");
  const after = await inspect(page);
  assert.notDeepEqual(after.camera.up, before.camera.up, "Release corrects roll");
  for (let i = 0; i < 3; i++)
    assert.ok(Math.abs(after.camera.position[i] - before.camera.position[i]) < 1e-8);
  assert.deepEqual(after.camera.target, before.camera.target);
  assert.equal(after.camera.height, before.camera.height);
  const direction = after.camera.position.map((v, i) => v - after.camera.target[i]);
  const distance = Math.hypot(...direction);
  const n = direction.map((v) => v / distance),
    u = after.camera.up;
  const right = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  assert.ok(
    right.some((v, i) => Math.abs(n[i]) < 1 - 1e-8 && Math.abs(v) < 1e-8),
    "Final canonical horizon is exact",
  );
  assert.deepEqual(after.document, before.document);
}
