import assert from "node:assert/strict";

async function screenshotPixels(page, locations) {
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
        [...context.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data].slice(0, 3),
      );
    },
    { data: png.toString("base64"), locations },
  );
}

/** Compare real composited pixels, including the blurred edge, with the unshadowed solid. */
export async function shadowOcclusionCheck(page, project, body, from) {
  const b = body.bounds;
  const top = [0.35, 0.5, 0.65].flatMap((x) =>
    [0.45, 0.6, 0.75].map((y) =>
      project.point([b[0] + (b[3] - b[0]) * x, b[1] + (b[4] - b[1]) * y, b[5]]),
    ),
  );
  await page.mouse.move(30, 740);
  const before = await screenshotPixels(page, top);
  await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  const shadows = page.locator(".movement-shadows:visible");
  assert.equal(await shadows.count(), 1);
  const after = await screenshotPixels(page, top);
  // Allow small rendering rounding; a translucent shadow changes a channel by dozens.
  for (let i = 0; i < before.length; i++)
    assert.ok(
      before[i].every((v, c) => Math.abs(v - after[i][c]) <= 2),
      `Foreground surface was shadowed: ${before[i]} -> ${after[i]}`,
    );
  const masks = await shadows
    .locator(".shadow-occluder")
    .evaluateAll(
      (paths, points) =>
        paths.map((path) => points.map((p) => path.isPointInFill(new DOMPoint(p.x, p.y)))),
      top,
    );
  assert.ok(
    masks.every((hits) => hits.every(Boolean)),
    "Foreground triangles must mask the sampled surface",
  );
}
