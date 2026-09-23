import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Sample the screenshot, not renderer internals: this catches missing stencil,
// material/depth mistakes and fills that cover only an invisible model region.
export async function pixels(page, points, movePointer = true) {
  if (movePointer) await page.mouse.move(1100, 750);
  const locations = await Promise.all(points.map((p) => at(page, ...p)));
  const png = await page.screenshot({ scale: "css" });
  return page.evaluate(
    async ({ data, locations }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return locations.map((p) =>
        Array.from(context.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data).slice(0, 3),
      );
    },
    { data: png.toString("base64"), locations },
  );
}
export const tinted = (before, after) =>
  assert.ok(
    after[0] < before[0] - 10 && after[2] - after[0] > before[2] - before[0] + 8,
    `Expected translucent blue fill: ${before} -> ${after}`,
  );
export async function fillRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const samples = [
    [-7.3, -7.3],
    [16.3, 6.3],
  ];
  const blank = await pixels(page, samples);
  // A loop made from ordinary independent drags must fill too.
  for (const [a, b] of [
    [
      [-20, -20],
      [0, -20],
    ],
    [
      [0, -20],
      [0, 0],
    ],
    [
      [0, 0],
      [-20, 0],
    ],
    [
      [-20, 0],
      [-20, -20],
    ],
  ]) {
    await page.keyboard.press("l"); // Explicitly draw from an existing endpoint.
    await drag(page, a, b);
  }
  let filled = await pixels(page, samples);
  tinted(blank[0], filled[0]);
  assert.deepEqual(filled[1], blank[1], "Open space remains unfilled");
  await page.keyboard.press("Delete");
  assert.deepEqual(
    (await pixels(page, samples))[0],
    blank[0],
    "Removing a boundary opens the loop",
  );
  await page.keyboard.press("Control+z");
  tinted(blank[0], (await pixels(page, samples))[0]);
  await page.keyboard.press("r");
  await drag(page, [10, 2], [25, 15]);
  filled = await pixels(page, samples);
  tinted(blank[1], filled[1]);
  // The inner closed region gets the same tint, not a darker overlapping fill.
  await page.keyboard.press("r");
  await drag(page, [12, 4], [19, 11]);
  assert.deepEqual((await pixels(page, samples))[1], filled[1]);
  await page.keyboard.press("v");
  await click(page, -10, -20);
  await click(page, -20, -20);
  await drag(page, [-20, -20], [-23, -23]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 12);
  tinted(blank[0], (await pixels(page, samples))[0]);
  // Drawing fused this loop. Explicitly detach one joint before opening it.
  const first = (await inspect(page)).document.sketches[0].curves[0];
  await click(page, 30, -25);
  await click(page, first.b.x, first.b.y);
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  await inspect(page);
  await click(page, first.a.x * 0.6 + first.b.x * 0.4, first.a.y * 0.6 + first.b.y * 0.4);
  await page.getByRole("textbox", { name: "Length", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  assert.deepEqual(
    (await pixels(page, samples))[0],
    blank[0],
    "An independent line edit can still open the loop",
  );
  await page.keyboard.press("Control+z");
  tinted(blank[0], (await pixels(page, samples))[0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-fills.png` });
  console.log(
    `${name}: visible closed-line and rectangle fills, open edges, nested tint, Delete/Undo and endpoint editing passed`,
  );
}
