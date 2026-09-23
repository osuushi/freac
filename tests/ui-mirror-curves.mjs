import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function mirrorCurvesRoute(page, name) {
  // Exercise both other sketch planes and the existing cubic/arc edit controls.
  for (const plane of ["XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await chooseTool(page, "grid snap", "grid");
    await page.keyboard.press("b");
    await drag(page, [4, 4], [16, 4]);
    await handle(page, "c1", [7, 10]);
    const original = (await inspect(page)).document.sketches[0].curves[0];
    await chooseTool(page, "mirror", "mirror");
    await click(page, 0, -20);
    await inspect(page);
    await page.keyboard.press("Enter");
    let state = await inspect(page);
    const copy = state.document.sketches[0].curves[1];
    assert.ok(Math.abs(copy.c1.x + original.c1.x) < 1e-7);
    await page.keyboard.press("v");
    // Select through the curve, away from endpoint and midpoint handles.
    const t = 0.3,
      u = 1 - t;
    const x =
      u ** 3 * copy.a.x +
      3 * u ** 2 * t * copy.c1.x +
      3 * u * t ** 2 * copy.c2.x +
      t ** 3 * copy.b.x;
    const y =
      u ** 3 * copy.a.y +
      3 * u ** 2 * t * copy.c1.y +
      3 * u * t ** 2 * copy.c2.y +
      t ** 3 * copy.b.y;
    await click(page, x, y);
    await handle(page, "c1", [-8, 12]);
    state = await inspect(page);
    assert.deepEqual(state.document.sketches[0].curves[0], original);
    assert.ok(Math.abs(state.document.sketches[0].curves[1].c1.y - 12) < state.camera.height / 850);
    await page.keyboard.press("l");
    await drag(page, [5, -8], [15, -8]);
    await page.keyboard.press("v");
    await click(page, 7, -8);
    const guide = await page.locator(".bow-handle").first().boundingBox();
    assert.ok(guide);
    await page.mouse.click(guide.x + guide.width / 2, guide.y + guide.height / 2);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("8");
    await page.keyboard.press("Enter");
    const arc = (await inspect(page)).document.sketches[0].curves.at(-1);
    assert.equal(arc.kind, "arc");
    await chooseTool(page, "mirror", "mirror");
    await click(page, 0, -20);
    await inspect(page);
    await page.keyboard.press("Enter");
    const reflected = (await inspect(page)).document.sketches[0].curves.at(-1);
    assert.equal(reflected.kind, "arc");
    assert.equal(reflected.bulge, -arc.bulge);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("9");
    await page.keyboard.press("Enter");
    state = await inspect(page);
    assert.notEqual(state.document.sketches[0].curves.at(-1).bulge, reflected.bulge);
    assert.deepEqual(state.document.sketches[0].curves.at(-2), arc);
  }
  console.log(`${name}: reflected cubic handles and arc radius edit independently on XZ/YZ`);
}
async function handle(page, key, to) {
  const box = await page.locator(`[data-handle="${key}"][data-curve]`).boundingBox();
  assert.ok(box);
  const target = await at(page, ...to);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}

export async function mirrorConstraintRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("l");
  await drag(page, [-12, -10], [-2, -5]);
  await page.keyboard.press("l");
  await drag(page, [5, 5], [15, 5]);
  await page.getByRole("button", { name: "Constrain horizontal", exact: true }).click();
  const before = (await inspect(page)).document;
  await chooseTool(page, "mirror", "mirror");
  await click(page, -7, -7.5);
  let state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, before);
  assert.match(await page.getByRole("status").textContent(), /Mirror conflicts/);
  assert.equal(
    await page.getByRole("button", { name: "Accept mirror", exact: true }).isEnabled(),
    false,
  );
  await click(page, -20, 0);
  await inspect(page);
  const offset = page.getByRole("textbox", { name: "Mirror offset" });
  await offset.fill("");
  await offset.pressSequentially("-12", { delay: 60 });
  state = await inspect(page);
  assert.equal(await offset.inputValue(), "-12");
  assert.ok(await offset.evaluate((input) => input === document.activeElement));
  const reflected = state.preview.sketches[0].curves.at(-1);
  assert.ok(Math.abs(reflected.a.y + 24 + before.sketches[0].curves.at(-1).a.y) < 1e-7);
  await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-preview.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: conflicting mirror locks reject, recover and retain offset typing focus`);
}

export async function mirrorAxisPickingRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [5, 5], [15, 10]);
    const original = (await inspect(page)).document;
    await chooseTool(page, "mirror", "mirror");
    const source = original.sketches[0].curves[0];
    const edge = await at(page, (source.a.x + source.b.x) / 2, (source.a.y + source.b.y) / 2);
    await page.mouse.move(edge.x, edge.y);
    await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "crosshair");
    assert.deepEqual((await inspect(page)).document, original);
    if (plane === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-edge-hover.png` });
    await page.mouse.move(950, 650);
    await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "");
    await click(page, 0, 0);
    assert.equal((await inspect(page)).preview, null, "Axis crossing needs an unambiguous pick");
    const axis = await at(page, -20, 0);
    await page.mouse.move(axis.x, axis.y);
    await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "crosshair");
    assert.deepEqual((await inspect(page)).document, original, "Hover does not edit geometry");
    assert.equal((await inspect(page)).preview, null);
    if (plane === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-axis-hover.png` });
    await page.mouse.click(axis.x, axis.y);
    let state = await inspect(page),
      copy = state.preview.sketches[0].curves[1];
    assert.ok(Math.abs(copy.a.x - source.a.x) < 1e-7);
    assert.ok(Math.abs(copy.a.y + source.a.y) < 1e-7);
    // Pan with the operation active, then select the other axis in its new screen position.
    await page.mouse.move(950, 650);
    await page.mouse.wheel(70, 50);
    await page.waitForFunction(
      (x) => window.freacInspect().projection.origin.x !== x,
      state.projection.origin.x,
    );
    await click(page, 0, 20);
    state = await inspect(page);
    copy = state.preview.sketches[0].curves[1];
    assert.ok(Math.abs(copy.a.x + source.a.x) < 1e-7);
    assert.ok(Math.abs(copy.a.y - source.a.y) < 1e-7);
    assert.deepEqual(state.document, original);
    await page.mouse.move(950, 650);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -20);
    await page.keyboard.up("Control");
    await page.waitForFunction(
      (height) => window.freacInspect().camera.height !== height,
      state.camera.height,
    );
    await click(page, -20, 0);
    state = await inspect(page);
    copy = state.preview.sketches[0].curves[1];
    assert.ok(Math.abs(copy.a.y + source.a.y) < 1e-7);
    await page.keyboard.press("Escape");
    assert.equal((await inspect(page)).interaction, null);
    if (plane === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-mirror-hover-cancelled.png` });
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log(
    `${name}: viewport axis hover/click, origin ambiguity and switching after pan/zoom on XY/XZ/YZ passed`,
  );
}
