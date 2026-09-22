import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function tube(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  await drag(page, [0, 0], [4, 0]);
  const p = await at(page, 7, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(p.x, p.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  return (await inspect(page)).document;
}
async function shaft(handle) {
  const d = await handle.locator('path[data-contour="0"]').first().getAttribute("d");
  const points = d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  return { x: points[2] - points[0], y: points[3] - points[1] };
}
export async function offsetPlacementRoute(page, name) {
  const original = await tube(page);
  const handle = page.getByRole("button", { name: "Offset faces", exact: true });
  for (const inward of [false, true]) {
    await page.mouse.click(960, 700);
    await orient(page, [0, -1, 0.7]);
    const p = await project(page, inward ? [0, 4, 8] : [0, -10, 5]);
    await page.mouse.click(p.x, p.y);
    const selected = await inspect(page);
    const face = original.bodies[0].faces.find((f) => f.id === selected.modelingSelection[0]?.face);
    assert.equal(face?.cylinder?.outward, inward ? -1 : 1);
    for (const direction of [
      [0, -1, 0.1],
      [0.01, -1, 0.1],
      [-0.01, -1, 0.1],
      [1, 0, 0.7],
    ]) {
      await orient(page, direction);
      const arrow = await shaft(handle);
      assert.ok(Math.hypot(arrow.x, arrow.y) > 19, "radial arrow remains readable");
    }
    await page.screenshot({
      path: `.cache/sketch-review/${name}-offset-${inward ? "inner" : "outer"}.png`,
    });
    assert.deepEqual((await inspect(page)).document, original);
    const arrow = await shaft(handle),
      box = await handle.boundingBox();
    const state = await inspect(page);
    const canvas = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
    const scale = (2 * canvas.height) / state.camera.height / 24;
    await page.mouse.move(box.x + 32, box.y + 32);
    await page.mouse.down();
    await page.mouse.move(box.x + 32 + arrow.x * scale, box.y + 32 + arrow.y * scale, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => !!window.freacInspect().preview);
    const preview = await inspect(page);
    assert.ok(preview.preview);
    const radius = inward ? 2 : 12;
    const wall = preview.preview.bodies[0].faces.find(
      (f) => f.cylinder?.outward === (inward ? -1 : 1),
    );
    close(wall.cylinder.radius, radius);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    await handle.click();
    await page
      .getByRole("textbox", { name: "Face diameter", exact: true })
      .fill(String(radius * 2));
    await page.keyboard.press("Enter");
    assert.ok((await inspect(page)).document.bodies[0].volume > original.bodies[0].volume);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
  console.log(
    `${name}: cylinder Offset side placement, orbit, inner/outer drag, cancellation and history passed`,
  );
}
