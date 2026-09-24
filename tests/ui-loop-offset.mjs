import assert from "node:assert/strict";
import { pixels, tinted } from "./ui-fill.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { moveCopiedJunction } from "./ui-offset-links.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function loopOffsetRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("r");
    await drag(page, plane === "XZ" ? [-10, 6] : [-10, -6], plane === "XZ" ? [10, -6] : [10, 6]);
    const before = (await inspect(page)).document.sketches[0];
    await page.getByRole("button", { name: "Offset loop", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Offset distance", exact: true });
    await input.fill("2");
    await page.waitForFunction(
      () => window.freacInspect().preview?.sketches[0].curves.length === 8,
    );
    assert.deepEqual(
      (await inspect(page)).document.sketches[0],
      before,
      "Preview leaves source document intact",
    );
    await page.keyboard.press("Enter");
    const result = (await inspect(page)).document.sketches[0];
    assert.equal(result.curves.length, 8);
    for (const source of before.curves) {
      const current = result.curves.find((c) => c.id === source.id);
      assert.equal(current.kind, source.kind);
      assert.equal(current.construction, source.construction);
      pointEquals(current.a, [source.a.x, source.a.y]);
      pointEquals(current.b, [source.b.x, source.b.y]);
    }
    assert.deepEqual(result.constraints.slice(0, before.constraints.length), before.constraints);
    assert.equal(result.constraints.length, before.constraints.length + 4);
    assert.deepEqual(result.groups, before.groups);
    for (const curve of result.curves.slice(4)) {
      close(Math.abs(curve.a.x), 12);
      close(Math.abs(curve.a.y), 8);
      close(Math.abs(curve.b.x), 12);
      close(Math.abs(curve.b.y), 8);
    }
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document.sketches[0], before);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document.sketches[0], result);
    if (plane === "XY") await moveCopiedJunction(page, before, result);
    await page.keyboard.press("v");
    await click(page, 3, 1);
    await page.getByRole("button", { name: "Offset loop", exact: true }).click();
    await page.getByRole("textbox", { name: "Offset distance" }).fill("-2");
    await page.keyboard.press("Enter");
    const inward = (await inspect(page)).document.sketches[0];
    for (const curve of inward.curves.slice(8)) {
      close(Math.abs(curve.a.x), 8);
      close(Math.abs(curve.a.y), 4);
    }
    assert.equal(inward.curves.length, 12);
    await page.getByRole("button", { name: "Offset loop", exact: true }).click();
    await page.getByRole("textbox", { name: "Offset distance" }).fill("-4");
    await page.keyboard.press("Enter");
    assert.deepEqual((await inspect(page)).document.sketches[0], inward);
    assert.equal(
      await page.getByRole("textbox", { name: "Offset distance" }).getAttribute("aria-invalid"),
      "true",
    );
    await page.keyboard.press("Escape");
  }
  await curvedLoop(page, name);
  await concaveAndAmbiguous(page);
  await concaveArcCorner(page);
  await offsetArcRadius(page);
  console.log(
    `${name}: line/arc loop offsets, all-plane rectangles, inward/outward preview, fill/move, concavity, ambiguity/collapse rejection and Undo/Redo passed`,
  );
}

async function offsetArcRadius(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-4, 0], [4, 0]);
  await page.keyboard.press("l");
  await drag(page, [4, 0], [-4, 0]);
  await bow(page, [0, 8]);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("4");
  await page.keyboard.press("Enter");
  await chooseTool(page, "select", "select");
  await drag(page, [-10, 12], [10, -6]);
  await page.getByRole("button", { name: "Offset loop", exact: true }).click();
  await page.getByRole("textbox", { name: "Offset distance" }).fill("-1");
  await page.keyboard.press("Enter");
  const result = (await inspect(page)).document.sketches[0];
  const arc = result.curves.slice(2).find((c) => c.kind === "arc");
  assert.ok(arc && Math.abs(arc.bulge) < 1);
  await click(page, 15, -10);
  await click(page, 2, Math.sqrt(5));
  assert.deepEqual((await inspect(page)).selection, [arc.id]);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("4");
  await page.keyboard.press("Enter");
  const current = (await inspect(page)).document.sketches[0].curves.find((c) => c.id === arc.id);
  assert.ok(Math.abs(current.bulge) < 1, "Radius edit keeps the offset arc's minor branch");
  pointEquals(current.a, [arc.a.x, arc.a.y]);
  pointEquals(current.b, [arc.b.x, arc.b.y]);
}

async function concaveArcCorner(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  for (const [a, b, target] of [
    [
      [0, 0],
      [10, 0],
    ],
    [
      [10, 0],
      [10, 10],
    ],
    [
      [10, 10],
      [0, 10],
      [5, 7],
    ],
    [
      [0, 10],
      [0, 0],
    ],
  ]) {
    await page.keyboard.press("l");
    await drag(page, a, b);
    if (target) await bow(page, target);
  }
  await page.keyboard.press("v");
  await drag(page, [-8, 18], [18, -8]);
  const before = (await inspect(page)).document;
  assert.ok(Math.abs(before.sketches[0].curves[2].bulge + 0.6) < 0.01);
  await page.getByRole("button", { name: "Offset loop", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Offset distance" });
  await input.fill("1");
  await page.keyboard.press("Enter");
  await page
    .getByRole("status")
    .filter({ hasText: /could not close a surviving section/ })
    .waitFor();
  assert.deepEqual((await inspect(page)).document, before);
  await input.fill("0.1");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 8);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
}

async function bow(page, target) {
  const to = await at(page, ...target);
  const handles = await page.locator(".bow-handle").all();
  const boxes = await Promise.all(handles.map((h) => h.boundingBox()));
  boxes.sort((a, b) => Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y));
  const box = boxes[0];
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}
async function curvedLoop(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const [a, b, target] of [
    [
      [-6, -4],
      [6, -4],
    ],
    [
      [6, -4],
      [6, 4],
      [10, 0],
    ],
    [
      [6, 4],
      [-6, 4],
    ],
    [
      [-6, 4],
      [-6, -4],
      [-10, 0],
    ],
  ]) {
    await page.keyboard.press("l");
    await drag(page, a, b);
    if (target) await bow(page, target);
  }
  await page.keyboard.press("v");
  await page.keyboard.press("Control+a");
  const source = (await inspect(page)).document.sketches[0];
  assert.equal((await inspect(page)).selection.length, 4);
  assert.equal(source.curves.filter((c) => c.kind === "arc").length, 2);
  const blank = await pixels(page, [[-11, 0]]);
  const control = await page
    .getByRole("button", { name: "Offset loop", exact: true })
    .boundingBox();
  // The first edge runs right along the bottom: outward is downward.
  const origin = await at(page, 0, 0),
    target = await at(page, 0, -2);
  await page.mouse.move(control.x + control.width / 2, control.y + control.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    control.x + control.width / 2 + target.x - origin.x,
    control.y + control.height / 2 + target.y - origin.y,
    { steps: 8 },
  );
  await page.mouse.up();
  let result = (await inspect(page)).document.sketches[0];
  assert.equal(result.curves.length, 8);
  assert.deepEqual(result.curves.slice(0, 4), source.curves);
  for (const arc of result.curves.slice(4).filter((c) => c.kind === "arc")) {
    close(arc.bulge, 1);
    close(Math.hypot(arc.a.x - arc.b.x, arc.a.y - arc.b.y) / 2, 6);
  }
  tinted(blank[0], (await pixels(page, [[-11, 0]]))[0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-loop-offset.png` });
  const accepted = result;
  // Move the accepted loop as one selection, leaving the original profile intact.
  await drag(page, [1, -6], [3, -8], ["Shift"]);
  result = (await inspect(page)).document.sketches[0];
  assert.deepEqual(result.curves.slice(0, 4), source.curves);
  const bottom = result.curves[4],
    dx = bottom.a.x + 6,
    dy = bottom.a.y + 6;
  const state = await inspect(page),
    viewport = await page.getByLabel("Modeling viewport").boundingBox();
  // Pointer-down quantization in WebKit can shift the grabbed point by a pixel.
  // Check actual pointer accuracy separately from exact rigid geometry.
  assert.ok(Math.abs(dx - 2) < state.camera.height / viewport.height);
  assert.ok(Math.abs(dy + 2) < state.camera.height / viewport.height);
  pointEquals(bottom.b, [6 + dx, -6 + dy]);
  for (const curve of result.curves.slice(4)) {
    const old = accepted.curves.find((c) => c.id === curve.id);
    pointEquals(curve.a, [old.a.x + dx, old.a.y + dy]);
    pointEquals(curve.b, [old.b.x + dx, old.b.y + dy]);
    if (curve.kind === "arc") close(curve.bulge, old.bulge);
  }
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], source);
}

export async function concaveAndAmbiguous(page) {
  for (const crossed of [false, true]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    const points = crossed
      ? [
          [0, 0],
          [8, 8],
          [0, 8],
          [8, 0],
        ]
      : [
          [0, 0],
          [10, 0],
          [10, 4],
          [4, 4],
          [4, 10],
          [0, 10],
        ];
    for (let i = 0; i < points.length; i++) {
      await page.keyboard.press("l");
      await drag(page, points[i], points[(i + 1) % points.length]);
    }
    await page.keyboard.press("v");
    await drag(page, [-8, 18], [18, -8]);
    const before = (await inspect(page)).document;
    await page.getByRole("button", { name: "Offset loop", exact: true }).click();
    if (crossed) {
      await page
        .getByRole("status")
        .filter({ hasText: /crossings|ambiguous/i })
        .waitFor();
      assert.deepEqual((await inspect(page)).document, before);
    } else {
      await page.getByRole("textbox", { name: "Offset distance" }).fill("1");
      await page.keyboard.press("Enter");
      const curves = (await inspect(page)).document.sketches[0].curves;
      assert.equal(curves.length, 12);
      assert.ok(
        curves.slice(6).some((c) => Math.abs(c.a.x - 5) < 1e-7 && Math.abs(c.a.y - 5) < 1e-7),
      );
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, before);
    }
  }
}
