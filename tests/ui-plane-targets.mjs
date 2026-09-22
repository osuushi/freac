import assert from "node:assert/strict";
import { inspect, reset } from "./ui-helpers.mjs";

export async function planeTargetsRoute(page, name) {
  for (const id of ["XY", "XZ", "YZ"]) {
    await reset(page);
    const before = await inspect(page);
    await assertTargetContainsOrigin(page, id);
    const hit = await findRaycastPoint(page, id);
    assert.deepEqual((await inspect(page)).document, before.document, "Hover is presentation only");
    if (id === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-plane-target-hover.png` });
    await page.mouse.click(hit.x, hit.y);
    assert.equal((await inspect(page)).activePlane, id, "Raycast click enters its plane");
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  await reset(page);
  await assertEditorTabOrder(page);
  await reset(page);
  const keyboardTarget = page.getByRole("button", { name: "Sketch on XY", exact: true });
  let focused = false;
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Tab");
    focused = await keyboardTarget.evaluate((target) => document.activeElement === target);
    if (focused) break;
  }
  assert.equal(focused, true, "Tab reaches plane entry");
  const targetBox = await keyboardTarget.boundingBox();
  assert.ok(targetBox && targetBox.width > 80, "Focused plane entry names its action");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activePlane, "XY", "Keyboard activation remains available");
  await reset(page);
  for (const id of ["XY", "XZ", "YZ"]) {
    await page.getByRole("button", { name: `Sketch on ${id}`, exact: true }).click();
    assert.equal((await inspect(page)).activePlane, id, `${id} accessible target activates`);
    await reset(page);
  }
  console.log(`${name}: camera-raycast plane target hover and click passed`);
}

async function assertEditorTabOrder(page) {
  assert.equal(await page.locator(".toolbox").count(), 0, "Old toolbar is removed");
  const tools = page.getByRole("button", { name: "Tools", exact: true });
  let focused = false;
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Tab");
    focused = await tools.evaluate((button) => button === document.activeElement);
    if (focused) break;
  }
  assert.equal(focused, true, "Tools is keyboard accessible");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await page.keyboard.press("Escape");
}

async function assertTargetContainsOrigin(page, id) {
  const { origin, points } = await page.evaluate(targetGeometry, id);
  assert.ok(inside(origin, points), `${id} section contains the projected world origin`);
}

export async function findRaycastPoint(page, id) {
  const { origin, points } = await page.evaluate(targetGeometry, id),
    bounds = {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
    },
    candidates = points.flatMap((point) =>
      [0.85, 0.65, 0.45].map((weight) => ({
        x: origin.x + (point.x - origin.x) * weight,
        y: origin.y + (point.y - origin.y) * weight,
      })),
    );
  for (let row = 1; row < 8; row++) {
    for (let column = 1; column < 8; column++) {
      const point = {
        x: bounds.left + ((bounds.right - bounds.left) * column) / 8,
        y: bounds.top + ((bounds.bottom - bounds.top) * row) / 8,
      };
      if (inside(point, points)) candidates.push(point);
    }
  }
  for (const point of candidates) {
    const overButton = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".plane-label") !== null,
      point,
    );
    if (overButton) continue;
    await page.mouse.move(point.x, point.y);
    if ((await page.locator(`[data-plane-target="${id}"]`).getAttribute("data-hovered")) === "true")
      return point;
  }
  assert.fail(`Could not raycast the ${id} coordinate-plane section`);
}

function targetGeometry(plane) {
  const target = document.querySelector(`[data-plane-target="${plane}"]`),
    origin = document.querySelector(".origin");
  if (!(target instanceof HTMLElement) || !(origin instanceof HTMLElement))
    throw new Error(`Missing ${plane} plane target`);
  const marker = origin.getBoundingClientRect(),
    points = JSON.parse(target.dataset.projectedPolygon ?? "[]");
  return { origin: { x: marker.left - 8, y: marker.top - 8 }, points };
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}
