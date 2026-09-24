import assert from "node:assert/strict";
import * as THREE from "three";
import { orient } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

export async function boldHiddenEdges(page, name) {
  const before = (await inspect(page)).camera;
  const offset = new THREE.Vector3(...before.position).sub(new THREE.Vector3(...before.target));
  const yaw = Math.atan2(offset.y, offset.x);
  await orient(page, [Math.cos(yaw) * Math.sin(2.4), Math.sin(yaw) * Math.sin(2.4), Math.cos(2.4)]);
  const { camera } = await inspect(page),
    bounds = await page.locator("canvas").boundingBox();
  const half = camera.height / 2,
    width = (half * bounds.width) / bounds.height;
  const view = new THREE.OrthographicCamera(-width, width, half, -half, 0.1, 10000);
  view.position.fromArray(camera.position);
  view.up.fromArray(camera.up);
  view.lookAt(new THREE.Vector3(...camera.target));
  view.updateMatrixWorld();
  // Selected top rear edge is behind the bottom face from this below-body view.
  const p = new THREE.Vector3(0, 10, 5).project(view);
  const clip = {
    x: Math.round(bounds.x + ((p.x + 1) * bounds.width) / 2 - 10),
    y: Math.round(bounds.y + ((1 - p.y) * bounds.height) / 2 - 10),
    width: 20,
    height: 20,
  };
  const selected = await bluePixels(page, clip);
  assert.ok(
    selected > 45,
    `Bold through-body highlight must cover multiple pixel rows (${selected})`,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-bold-edge-highlights.png` });
  await page.mouse.click(960, 710);
  await page.mouse.move(1000, 700);
  await inspect(page);
  const plain = await bluePixels(page, clip);
  assert.ok(plain < selected / 3, "Clearing selection removes the through-body highlight");
}
async function bluePixels(page, clip) {
  const png = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        pixels[i + 2] > 160 &&
        pixels[i + 2] > pixels[i] + 80 &&
        pixels[i + 2] > pixels[i + 1] + 20
      )
        count++;
    return count;
  }, png);
}
