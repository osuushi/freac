import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function rotationSnappingRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  const original = (await inspect(page)).document;
  const from = (await inspect(page)).rotationHandle;
  const origin = await at(page, 0, 0);
  const radians = (-17.3 * Math.PI) / 180;
  const dx = from.x - origin.x,
    dy = from.y - origin.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(
    origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    { steps: 8 },
  );
  const angle = async () => {
    const state = await inspect(page);
    const curves = (state.preview ?? state.document).sketches[0].curves;
    const line = curves[curves.length - 4];
    return (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
  };
  const free = await angle();
  assert.ok(Math.abs(free - 17.3) < 0.2, `free angle ${free}`);
  await page.keyboard.down("Shift");
  assert.ok(Math.abs((await angle()) - 15) < 1e-6);
  await page.keyboard.down("Alt");
  assert.ok(Math.abs((await angle()) - Math.round(free * 2) / 2) < 1e-6);
  await page.keyboard.up("Alt");
  assert.ok(Math.abs((await angle()) - 15) < 1e-6);
  await page.keyboard.up("Shift");
  assert.ok(Math.abs((await angle()) - free) < 1e-6);
  await page.keyboard.down("Shift");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert.ok(Math.abs((await angle()) - 15) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: free/5°/0.5° rotation, stationary modifiers, accepted geometry and Undo passed`,
  );
}

export async function placementRotationSnapping(page, from, origin) {
  const original = (await inspect(page)).document;
  const radians = (-17.3 * Math.PI) / 180;
  const dx = from.x - origin.x,
    dy = from.y - origin.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(
    origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    { steps: 8 },
  );
  const input = page.getByRole("textbox", { name: "Rotation Z", exact: true });
  const free = Number(await input.inputValue());
  // WebKit rounds screen coordinates; use the measured free angle for quantization.
  assert.ok(free > 15 && free < 20, `placement free angle ${free}`);
  assert.ok(Math.abs(free * 2 - Math.round(free * 2)) > 0.01);
  await page.keyboard.down("Shift");
  assert.equal(Number(await input.inputValue()), Math.round(free / 5) * 5);
  await page.keyboard.down("Alt");
  assert.equal(Number(await input.inputValue()), Math.round(free * 2) / 2);
  const state = await inspect(page);
  const frame = state.preview.sketches.at(-1).plane;
  assert.ok(
    Math.abs((Math.atan2(frame.u[1], frame.u[0]) * 180) / Math.PI - Math.round(free * 2) / 2) <
      1e-6,
  );
  await page.keyboard.up("Alt");
  assert.equal(Number(await input.inputValue()), Math.round(free / 5) * 5);
  await page.keyboard.up("Shift");
  assert.equal(Number(await input.inputValue()), free);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).document, original);
}
