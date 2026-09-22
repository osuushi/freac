import assert from "node:assert/strict";
import { pixels } from "./ui-fill.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cutawayRoute(page, name, plane = "XY") {
  await reset(page);
  await page.getByRole("button", { name: `Sketch on ${plane}`, exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-18, -18], [18, 18]);
  const pick = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const body = (await inspect(page)).document.bodies;
  await page.getByRole("button", { name: `Sketch on ${plane}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  const blank = await pixels(page, [[3.4, 4]]);
  await page.keyboard.press("l");
  await drag(page, [-8, 4], [8, 4]);
  await page.keyboard.press("Escape");
  const ink = await pixels(page, [[3.4, 4]]);
  assert.ok(ink[0][0] < blank[0][0] - 30, `Sketch visible through solid: ${blank} -> ${ink}`);
  assert.deepEqual((await inspect(page)).document.bodies, body);
  await page.screenshot({ path: `.cache/sketch-review/${name}-${plane}-sketch-cutaway.png` });
  // Exit with the same camera pose: the front face must cover the new line again.
  const point = await at(page, 3.4, 4);
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  const png = await page.screenshot({ scale: "css" });
  const restored = await page.evaluate(
    async ({ data, point }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data[0];
    },
    { data: png.toString("base64"), point },
  );
  assert.ok(restored > ink[0][0] + 30, "Full body rendering restored after leaving sketch");
  assert.deepEqual((await inspect(page)).document.bodies, body);
  console.log(
    `${name} ${plane}: real extrusion, visible sketch line through solid, unchanged body and exit restoration pass`,
  );
}
