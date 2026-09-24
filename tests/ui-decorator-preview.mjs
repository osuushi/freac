import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";

export async function recessedPreviewRoute(page, name) {
  const before = (await inspect(page)).document;
  await clearSelection(page);
  await page.mouse.move(100, 80);
  const point = await project(page, [0, -8, 5]);
  let count = 0;
  const deadline = Date.now() + 15000;
  do {
    const png = await page.screenshot({
      clip: {
        x: Math.round(point.x) - 24,
        y: Math.round(point.y) - 24,
        width: 48,
        height: 48,
      },
    });
    count = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 48;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 48, 48).data;
      let teal = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 1] - pixels[i] > 25 && pixels[i + 2] - pixels[i + 1] < 30) teal++;
      return teal;
    }, png.toString("base64"));
  } while (count < 1200 && Date.now() < deadline);
  assert.ok(
    count >= 1200,
    `Recessed preview must fill the interior face sample (${count}/2304 teal pixels)`,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-recessed-thread-preview.png` });
  await worldClick(page, [0, -8, 5]);
  const selected = await inspect(page);
  assert.equal(selected.modelingSelection[0]?.kind, "face", "Preview keeps original face picking");
  assert.deepEqual(selected.document, before, "Rendering and picking preserve the document");
}
