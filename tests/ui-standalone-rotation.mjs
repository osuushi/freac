import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function standaloneRotationRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("r");
    await drag(page, [-10, -6], [10, 6]);
    const original = (await inspect(page)).document;
    const marker = page.locator('[data-move-marker="rotation"] svg');
    assert.equal(await marker.count(), 1);
    const box = await marker.boundingBox();
    assert.equal(await marker.getAttribute("width"), "48");
    assert.ok(box.width > 0);
    const ring = (await inspect(page)).rotationHandle;
    await page.mouse.click(ring.x, ring.y);
    await page.getByRole("textbox", { name: "Angle", exact: true }).fill("90");
    await page.keyboard.press("Enter");
    const rotated = (await inspect(page)).document;
    const points = rotated.sketches[0].curves.flatMap((c) => [c.a, c.b]);
    close(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)), 12);
    close(Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)), 20);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, rotated);
    await page.keyboard.press("v");
    const edge = await at(page, 6, 4);
    await page.mouse.click(edge.x, edge.y);
    const from = (await inspect(page)).rotationHandle;
    const origin = await at(page, 0, 0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + from.y - origin.y, origin.y - from.x + origin.x, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual((await inspect(page)).document, rotated);
  }
  console.log(
    `${name}: standalone sketch rotation glyph, numeric edit, pointer cancel, Undo/Redo and reselection on all planes passed`,
  );
}
