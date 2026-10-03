import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { makePivotBox } from "./ui-orbit-pivot.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function arc(page, center, radius, angle) {
  await page.mouse.move(center.x + radius, center.y);
  await page.keyboard.down("Meta");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(
      center.x + radius * Math.cos((angle * i) / 8),
      center.y + radius * Math.sin((angle * i) / 8),
    );
  assert.equal((await inspect(page)).camera.orbitActive, true);
}
async function release(page) {
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
  await inspect(page);
}
function checkAngle(before, after, center, angle) {
  const x = before.x - center.x,
    y = before.y - center.y;
  // WebKit rounds pointer coordinates to CSS pixels; keep within one pixel.
  assert.ok(Math.abs(after.x - (center.x + x * Math.cos(angle) - y * Math.sin(angle))) < 1.5);
  assert.ok(Math.abs(after.y - (center.y + x * Math.sin(angle) + y * Math.cos(angle))) < 1.5);
}
async function selectedRoll(page, pivot, radius, angle) {
  const before = await inspect(page),
    center = await project(page, pivot);
  const sample = [pivot[0] - 8, pivot[1] - 5, pivot[2]],
    from = await project(page, sample);
  await arc(page, center, radius, angle);
  const fixed = await project(page, pivot);
  assert.ok(
    Math.hypot(fixed.x - center.x, fixed.y - center.y) < 1e-6,
    "Selected center stays fixed during roll",
  );
  checkAngle(from, await project(page, sample), center, angle);
  assert.deepEqual((await inspect(page)).document, before.document);
  await release(page);
}
export async function rollCenterRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+a");
  assert.equal((await inspect(page)).selectedCurves.length, 4);
  await selectedRoll(page, [10, 5, 0], 180, Math.PI / 6);

  const before = await inspect(page),
    bounds = await page.locator("canvas").boundingBox();
  assert.equal(before.modelingSelection.length, 0);
  assert.equal(before.selectionTargets.length, 0);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const from = await project(page, [0, 0, 0]);
  await arc(page, center, 230, -Math.PI / 6);
  checkAngle(from, await project(page, [0, 0, 0]), center, -Math.PI / 6);
  assert.deepEqual((await inspect(page)).camera.target, before.camera.target);
  await release(page);

  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const corner = await at(page, 20, 10);
  await page.mouse.click(corner.x, corner.y);
  const point = await inspect(page);
  assert.equal(point.selectedCurves.length, 0);
  assert.ok(point.selectedPoint, "Select an actual point, not its owner curves");
  await selectedRoll(page, [20, 10, 0], 160, -Math.PI / 6);

  await makePivotBox(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0].kind, "body");
  await selectedRoll(page, [0, 0, 6], 250, Math.PI / 6);
  console.log(
    `${name}: angular roll follows viewport, selected curves, point and body centers without document edits`,
  );
}
