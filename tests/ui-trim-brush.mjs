import assert from "node:assert/strict";
import { at, click, close, drag, inspect, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

import { diameter, highlights, lines, movePointer } from "./ui-trim-brush-helpers.mjs";

export async function trimBrushControlsRoute(page, name) {
  await lines(page, [
    [
      [-10, 0],
      [10, 0],
    ],
    [
      [-10, 2],
      [10, 2],
    ],
    [
      [-4, -6],
      [-4, 6],
    ],
    [
      [4, -6],
      [4, 6],
    ],
  ]);
  const p = await at(page, 0, 1),
    circle = page.locator(".trim-brush-circle");
  const controls = page.locator(".trim-brush-controls");
  assert.equal(await controls.isVisible(), false);
  await diameter(page, 2.2);
  const delivered = await movePointer(page, p);
  await page.keyboard.down("Alt");
  await circle.waitFor({ state: "visible" });
  assert.equal(await controls.isVisible(), true);
  assert.equal(await highlights(page).count(), 2);
  const points = (await circle.getAttribute("points"))
    .split(" ")
    .map((v) => v.split(",").map(Number));
  const origin = await at(page, 0, 0),
    right = await at(page, 1.1, 0);
  close(points[0][0], delivered.x + right.x - origin.x);
  close(points[0][1], delivered.y);
  await page.keyboard.press("BracketRight");
  assert.equal(await circle.getAttribute("data-diameter"), "2.6");
  await page.keyboard.press("Shift+BracketLeft");
  assert.equal(await circle.getAttribute("data-diameter"), "2.2");
  await page.keyboard.up("Alt");
  assert.equal(await controls.isVisible(), false);
  assert.equal(await circle.isVisible(), false);
  const slider = page.getByRole("slider", { name: "Brush diameter slider" });
  await page.keyboard.down("Alt");
  await slider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Alt");
  assert.equal(await circle.getAttribute("data-diameter"), "0.2");
  await diameter(page, 0);
  assert.equal(
    await circle.getAttribute("data-diameter"),
    "0.2",
    "invalid diameter retains last valid brush",
  );
  await page.keyboard.down("Alt");
  await page.keyboard.press("BracketLeft");
  assert.equal(await circle.getAttribute("data-diameter"), "0.1");
  await page.keyboard.press("BracketRight");
  assert.equal(await circle.getAttribute("data-diameter"), "0.2");
  await page.keyboard.up("Alt");
  await brushControlVisibility(page, p);
  await page.screenshot({ path: `.cache/sketch-review/${name}-trim-brush-controls.png` });
  console.log(
    `${name}: brush circle/mm diameter, slider, Option bracket/brace keys, stationary modifier preview and tool re-entry passed`,
  );
}

async function brushControlVisibility(page, p) {
  const controls = page.locator(".trim-brush-controls"),
    circle = page.locator(".trim-brush-circle");
  await diameter(page, 1);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Alt");
  assert.equal(await highlights(page).count(), 0);
  assert.equal(await circle.isVisible(), true);
  await page.keyboard.up("Alt");
  await page.keyboard.press("v");
  assert.equal(await page.locator(".trim-brush-controls").isVisible(), false);
  await page.keyboard.press("t");
  assert.equal(await controls.isVisible(), false);
  await page.keyboard.down("Alt");
  assert.equal(await controls.isVisible(), true);
  assert.equal(await circle.getAttribute("data-diameter"), "1");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await controls.isVisible(), false);
  await page.keyboard.up("Alt");
}

export async function trimBrushStrokeRoute(page, name) {
  await lines(page, [
    [
      [-10, 0],
      [10, 0],
    ],
    [
      [-10, 2],
      [10, 2],
    ],
    [
      [-4, -6],
      [-4, 6],
    ],
    [
      [4, -6],
      [4, 6],
    ],
  ]);
  await diameter(page, 2.2);
  const original = (await inspect(page)).document;
  const a = await at(page, -2, 1),
    b = await at(page, 2, 1);
  await page.mouse.move(a.x, a.y);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  assert.equal(await highlights(page).count(), 2);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "stroke remains temporary through release",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-trim-brush-stroke.png` });
  await page.keyboard.up("Alt");
  assert.equal(await page.locator(".trim-brush-controls").isVisible(), false);
  await page.mouse.up();
  const after = (await inspect(page)).document;
  const curves = after.sketches[0].curves;
  assert.equal(curves.length, 6);
  for (const y of [0, 2]) {
    const remnants = curves.filter((c) => c.a.y === y && c.b.y === y);
    assert.equal(remnants.length, 2);
    pointEquals(remnants[0].a, [-10, y]);
    pointEquals(remnants[0].b, [-4, y]);
    pointEquals(remnants[1].a, [4, y]);
    pointEquals(remnants[1].b, [10, y]);
  }
  assert.deepEqual(curves.slice(-2), original.sketches[0].curves.slice(-2));
  assert.equal(await highlights(page).count(), 0);
  await page.keyboard.down("Alt");
  assert.equal(
    await page.getByRole("spinbutton", { name: "Brush diameter", exact: true }).isEnabled(),
    true,
  );
  await page.keyboard.up("Alt");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "one Undo restores the entire stroke");
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await page.keyboard.press("v");
  await click(page, -10, 0);
  await drag(page, [-10, 0], [-12, -2], ["Shift"]);
  pointEquals((await inspect(page)).document.sketches[0].curves[0].a, [-12, -2]);
  console.log(
    `${name}: two-span brush stroke, exact remnants, one Undo/Redo and subsequent endpoint editing passed`,
  );
}

export async function trimBrushCancellationRoute(page, name) {
  await lines(page, [
    [
      [-5, -3],
      [-5, 3],
    ],
    [
      [0, -3],
      [0, 3],
    ],
    [
      [5, -3],
      [5, 3],
    ],
  ]);
  await diameter(page, 0.2);
  const original = (await inspect(page)).document;
  const a = await at(page, -10, 0),
    b = await at(page, 10, 0);
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  assert.equal(
    await highlights(page).count(),
    3,
    "sweep includes curves between sparse pointer events",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).interaction, null);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, original, "focus loss cancels held stroke");
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    canvas.addEventListener(
      "gotpointercapture",
      (event) => canvas.releasePointerCapture(event.pointerId),
      { once: true },
    );
  });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "lost pointer capture cancels held stroke",
  );
  await page.keyboard.up("Alt");
  await drag(page, [-10, 0], [10, 0], ["Alt"]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original, "cancelled strokes add no Undo");
  console.log(
    `${name}: sparse swept brush, Option+Escape/focus-loss cancellation and next stroke/Undo passed`,
  );
}

export async function trimBrushShiftRoute(page, name) {
  await lines(page, [
    [
      [-10, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [10, 0],
    ],
  ]);
  await diameter(page, 0.2);
  const original = (await inspect(page)).document,
    p = await at(page, -5, 0);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Alt");
  assert.equal(await highlights(page).count(), 1);
  await page.keyboard.down("Shift");
  assert.equal(await highlights(page).count(), 2);
  await click(page, -5, 0);
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Option+Shift brush retains chain policy and atomically restores with Undo passed`,
  );
}
