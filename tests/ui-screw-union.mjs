import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function quantity(page, label, value) {
  await page.getByRole("textbox", { name: `Revolution ${label}`, exact: true }).fill(String(value));
  await inspect(page);
  assert.ok(
    await page.getByRole("button", { name: "Accept revolution", exact: true }).isEnabled(),
    await page.locator(".status").textContent(),
  );
}
async function revolve(page, center, axis) {
  const p = await at(page, ...center),
    a = await at(page, ...axis);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  await chooseTool(page, "revolve", "revolve");
  await page.mouse.click(a.x, a.y);
  await inspect(page);
}
async function volume(page, expected) {
  const state = await inspect(page);
  assert.ok(state.preview, await page.locator(".status").textContent());
  const actual = state.preview.bodies.reduce((v, b) => v + b.volume, 0);
  assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
}
export async function screwUnionRoute(page, name, electron) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("l");
  const points = [
    [0, 10],
    [10, 10],
    [20, 0],
    [10, -10],
    [0, -10],
  ];
  for (let i = 0; i < points.length; i++)
    await drag(page, points[i], points[(i + 1) % points.length]);
  await revolve(page, [5, 3], [0, -14]);
  await quantity(page, "height", 46);
  await quantity(page, "angle", 20);
  await volume(page, ((7000 / 3) * Math.PI) / 9);
  await quantity(page, "angle", 360);
  await volume(page, (14000 / 3) * Math.PI);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [20, 0], [27, 0]);
  await revolve(page, [20, 0], [0, -10]);
  await quantity(page, "height", 10);
  await quantity(page, "angle", 720);
  const lens = 98 * Math.acos(5 / 14) - 2.5 * Math.sqrt(171);
  await volume(page, 40 * Math.PI * (98 * Math.PI - lens));
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-screw-union`, electron);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-2, 0], [3, 4]);
  await revolve(page, [1, 2], [0, -5]);
  await volume(page, 36 * Math.PI);
  await quantity(page, "height", 4);
  await quantity(page, "angle", 90);
  await volume(page, 13 * Math.PI);
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  assert.ok((await inspect(page)).document.bodies.length);
  console.log(
    `${name}: axis-touch helix, overlapping turns, crossing-axis union, cancel/Undo/archive passed`,
  );
}
