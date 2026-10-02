import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { orient, project } from "./ui-blend-edit.mjs";
import { decoratorTransformRoute } from "./ui-decorator-transforms.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function tealPixels(page) {
  const point = await project(page, [0, -8, 5]);
  const png = await page.screenshot({
    clip: { x: Math.round(point.x) - 24, y: Math.round(point.y) - 24, width: 48, height: 48 },
  });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 48;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 48, 48).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 1] - pixels[i] > 4 && pixels[i + 2] - pixels[i + 1] < 30) count++;
    return count;
  }, png.toString("base64"));
}

const names = runtimeNames(["chromium", "webkit"]);
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("c");
      await drag(page, [0, 0], [8, 0]);
      const center = await at(page, 0, 0);
      await chooseTool(page, "return to modeling", "modeling");
      await page.mouse.click(center.x, center.y);
      await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
      await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
      await page.keyboard.press("Enter");
      await inspect(page);
      await page.keyboard.press("Enter");
      await orient(page, [0, -1, 0.3]);
      await worldClick(page, [0, -8, 5]);
      await chooseTool(page, "threads", "threads");
      await page.waitForFunction(() => window.makeshiftInspect().decoratorPreviewBounds.length > 0);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      assert.ok((await inspect(page)).activePlane);
      await page.waitForTimeout(350);
      const sketchTeal = await tealPixels(page);
      assert.ok(
        sketchTeal > 100,
        `${name}: thread preview disappeared in sketch mode: ${sketchTeal}`,
      );
      await chooseTool(page, "return to modeling", "modeling");
      await orient(page, [0, -1, 0.3]);
      await page.waitForTimeout(350);
      const modelingTeal = await tealPixels(page);
      assert.ok(modelingTeal > sketchTeal, `${name}: modeling preview did not regain opacity`);
      await decoratorTransformRoute(page);
      console.log(`${name}: threaded preview visible in sketch and modeling modes`, {
        sketchTeal,
        modelingTeal,
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
