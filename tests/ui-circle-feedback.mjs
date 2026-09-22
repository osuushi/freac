import assert from "node:assert/strict";
import { pixels, tinted } from "./ui-fill.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function circleFeedback(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  const samples = [
    [2.3, 1.7],
    [12.3, 1.7],
  ];
  const blank = await pixels(page, samples);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("Escape");
  const filled = await pixels(page, samples);
  tinted(blank[0], filled[0]);
  assert.deepEqual(filled[1], blank[1], "Outside the analytic circle remains unfilled");
  await page.keyboard.press("v");
  await drag(page, [2, 3], [6, 6]); // Interior movement, without hitting the center or edge.
  pointEquals((await inspect(page)).document.sketches[0].curves[0].center, [4, 3]);
  await chooseTool(page, "undo", "undo");
  await click(page, 0, 0);
  const before = (await inspect(page)).document;
  await drag(page, [10, 0], [0, 0]);
  assert.deepEqual(
    (await inspect(page)).document,
    before,
    "Radius collapse rejects the entire edit",
  );
  await page.keyboard.press("c");
  await drag(page, [6, 0], [16, 0]);
  await page.keyboard.press("Escape");
  const overlap = await pixels(page, samples);
  assert.deepEqual(overlap[0], filled[0], "Overlapping circle fills retain one translucent tint");
  tinted(blank[1], overlap[1]);
  await snapChecks(page);
}

async function snapChecks(page) {
  await page.keyboard.press("l");
  const pointer = await at(page, 3.1, 9.4);
  await page.mouse.move(pointer.x, pointer.y);
  let state = await inspect(page);
  assert.equal(state.snap.label, "Intersection");
  await drag(page, [3.1, 9.4], [20, 20]);
  let line = (await inspect(page)).document.sketches[0].curves.at(-1);
  close(line.a.x, 3);
  close(line.a.y, Math.sqrt(91));
  await page.keyboard.press("l");
  await drag(page, [-6, -8], [-20, -20]);
  line = (await inspect(page)).document.sketches[0].curves.at(-1);
  await nearPointer(page, line.a, [-6, -8]);
  close(Math.hypot(line.a.x, line.a.y), 10, "Snapped point lies exactly on the analytic circle");
  await page.keyboard.press("l");
  await chooseTool(page, "grid snap", "grid");
  await drag(page, [-6.2, -8.2], [-20, -23], ["Shift"]);
  line = (await inspect(page)).document.sketches[0].curves.at(-1);
  await nearPointer(page, line.a, [-6.2, -8.2]);
  assert.ok(
    Math.hypot(line.a.x, line.a.y) > 10.1,
    "Shift keeps the start away from the circle and nearby endpoint",
  );
  await page.keyboard.press("c");
  await drag(page, [0.2, 0.2], [0, -4]);
  state = await inspect(page);
  const circle = state.document.sketches[0].curves.at(-1);
  pointEquals(circle.center, [0, 0]);
  // Grid is still disabled: radius follows the delivered pointer, not an integer.
  await nearPointer(page, { x: circle.radius, y: 0 }, [4, 0]);
  await page.keyboard.press("Escape");
  await click(page, 0, -4);
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByRole("textbox", { name: "Radius", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("5");
  await page.keyboard.press("Tab");
  close((await inspect(page)).document.sketches[0].curves.at(-1).radius, 5);
}

async function nearPointer(page, actual, [x, y]) {
  const { projection } = await inspect(page);
  const unitsPerPixel =
    1 / Math.hypot(projection.u.x - projection.origin.x, projection.u.y - projection.origin.y);
  // Native pointer delivery may quantize to CSS pixels. This does not relax
  // numeric dimensions, centers, intersections, or the circle equation checks.
  assert.ok(
    Math.hypot(actual.x - x, actual.y - y) <= unitsPerPixel,
    "Free/along-edge coordinates stay within one delivered pointer pixel",
  );
}
