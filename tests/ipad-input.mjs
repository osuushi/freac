import assert from "node:assert/strict";
import { penDriver } from "./ipad-pen.mjs";
import { tabletRegressions } from "./ipad-regressions.mjs";
import { at, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function tabletInputRoute(page, name) {
  // Restore the default oblique camera so the double tap must finish a real turn.
  await page.reload();
  await settled(page);
  let cdp;
  if (name === "chromium") cdp = await page.context().newCDPSession(page);
  const pen = await penDriver(page, cdp);
  await tabletRegressions(page, pen);
  await page.keyboard.press("l");
  await pen([-20, -20], [-5, -20]);
  let state = await inspect(page);
  assert.equal(state.document.sketches[0].curves.length, 5);
  await page.keyboard.press("v");
  const point = await at(page, -20, -20);
  await page.mouse.click(point.x, point.y);
  await pen([-20, -20], [-20, -15]);
  state = await inspect(page);
  const segment = state.document.sketches[0].curves.at(-1);
  assert.ok(Math.abs(segment.a.y + 15) < 0.001, "Pencil reselects and moves an existing endpoint");
  const before = state.document;
  const sketchPlane = state.activePlane;
  if (cdp) {
    const touch = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
      });
    // Two contacts should pan/zoom without prematurely leaving the sketch on first down.
    const camera = state.camera;
    await touch("touchStart", [[1, 420, 320]]);
    await touch("touchStart", [
      [1, 420, 320],
      [2, 600, 320],
    ]);
    await touch("touchMove", [
      [1, 400, 350],
      [2, 660, 350],
    ]);
    await touch("touchEnd", []);
    state = await inspect(page);
    assert.equal(state.activePlane, sketchPlane);
    assert.ok(state.camera.height < camera.height);
    assert.notDeepEqual(state.camera.target, camera.target);
    assert.deepEqual(state.document, before);
    const old = state.camera.position;
    await touch("touchStart", [[1, 520, 350]]);
    await touch("touchMove", [[1, 620, 410]]);
    await touch("touchEnd", []);
    state = await inspect(page);
    assert.equal(state.activePlane, null);
    assert.notDeepEqual(state.camera.position, old);
    assert.deepEqual(state.document, before);
    await cdp.detach();
  } else {
    // A real WebKit finger tap must neither draw nor select nor leave the sketch.
    await page.touchscreen.tap(420, 350);
    state = await inspect(page);
    assert.equal(state.activePlane, sketchPlane);
    assert.deepEqual(state.document, before);
    await page.evaluate(() => {
      window.testPen = false;
    });
    await chooseTool(page, "return to modeling", "modeling");
    await settled(page);
  }
  console.log(name, "Pencil creation/re-edit and touch navigation passed");
  return before;
}
