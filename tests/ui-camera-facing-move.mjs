import assert from "node:assert/strict";
import * as THREE from "three";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cameraFacingMove(page, project, body) {
  const from = project.point(body.center);
  const to = { x: from.x - 35, y: from.y + 20 };
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(...body.center),
  );
  const first = project.ray(from).intersectPlane(plane, new THREE.Vector3());
  const last = project.ray(to).intersectPlane(plane, new THREE.Vector3());
  const expected = new THREE.Vector3(...body.center).add(last.sub(first));
  await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  const selection = (await inspect(page)).modelingSelection;
  const shadows = page.locator(".movement-shadows:visible");
  assert.equal(await shadows.count(), 1);
  assert.equal(await shadows.locator("[data-plane]").count(), 3);
  assert.equal(await shadows.locator('[data-active="true"]').getAttribute("data-plane"), "YZ");
  const starting = await shadows
    .locator('[data-plane="YZ"] .shadow-current > path')
    .first()
    .getAttribute("d");
  assert.deepEqual((await inspect(page)).document.bodies[0], body);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await inspect(page);
  assert.equal(await shadows.getAttribute("data-moving"), "true");
  assert.equal(await shadows.locator(".shadow-start").count(), 0);
  assert.notEqual(
    await shadows.locator('[data-plane="YZ"] .shadow-current > path').first().getAttribute("d"),
    starting,
  );
  await page.screenshot({
    path: `.cache/sketch-review/${page.context().browser().browserType().name()}-movement-shadows.png`,
  });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  const moved = (await inspect(page)).document.bodies[0];
  assert.equal(await shadows.count(), 0);
  assert.ok(expected.distanceTo(new THREE.Vector3(...moved.center)) < 1e-5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.bodies[0], body);
  await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  assert.equal((await inspect(page)).interaction?.kind, "transform-box-move");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).document.bodies[0], body);
  assert.equal(await shadows.count(), 0);
  const restored = await inspect(page);
  assert.deepEqual(
    restored.modelingSelection,
    selection,
    "Escape must retain the selected body after release",
  );
  assert.equal(
    restored.modelingTool,
    "move",
    JSON.stringify({
      interaction: restored.interaction,
      selection: restored.modelingSelection,
      tool: restored.modelingTool,
    }),
  );
}
