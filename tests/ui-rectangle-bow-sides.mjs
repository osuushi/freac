import assert from "node:assert/strict";
import { pixels, tinted } from "./ui-fill.mjs";
import { at, click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function rectangleBowSides(page, name) {
  for (let index = 0; index < 4; index++) {
    await reset(page);
    await page.getByRole("button", { name: "Sketch on XY" }).click();
    await page.keyboard.press("r");
    await drag(page, [-10, -5], [10, 5]);
    if (index === 0) await page.getByRole("button", { name: "Lock Width", exact: true }).click();
    await page.getByRole("textbox", { name: "Angle", exact: true }).fill("37");
    await page.keyboard.press("Enter");
    await chooseTool(page, "select", "select");
    const before = (await inspect(page)).document,
      side = before.sketches[0].curves[index];
    const dx = side.b.x - side.a.x,
      dy = side.b.y - side.a.y,
      length = Math.hypot(dx, dy);
    const mid = { x: (side.a.x + side.b.x) / 2, y: (side.a.y + side.b.y) / 2 };
    const point = [mid.x + (dy / length) * 4, mid.y - (dx / length) * 4];
    const sample = [[mid.x + (dy / length) * 2, mid.y - (dx / length) * 2]];
    await click(page, 25, -20);
    const blank = await pixels(page, sample);
    await click(page, side.a.x + dx * 0.25, side.a.y + dy * 0.25);
    assert.deepEqual((await inspect(page)).selection, [side.id]);
    const to = await at(page, ...point);
    const boxes = await Promise.all(
      (await page.locator(".bow-handle").all()).map((h) => h.boundingBox()),
    );
    boxes.sort((a, b) => Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y));
    const box = boxes[0];
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await inspect(page);
    assert.equal(await page.getByRole("button", { name: "Remove and bow" }).count(), 0);
    if (index === 0)
      assert.match(await page.getByRole("status").textContent(), /constraints removed.*Undo/);
    const result = (await inspect(page)).document,
      arc = result.sketches[0].curves[index];
    assert.equal(arc.kind, "arc");
    pointEquals(arc.a, [side.a.x, side.a.y]);
    pointEquals(arc.b, [side.b.x, side.b.y]);
    await click(page, 25, -20);
    tinted(blank[0], (await pixels(page, sample))[0]);
    if (index === 0)
      await page.screenshot({ path: `.cache/sketch-review/${name}-rectangle-bow.png` });
    // Box-select the converted profile and drag it as a rigid whole.
    await drag(page, [-25, 25], [25, -25]);
    assert.equal((await inspect(page)).selection.length, 4);
    const other = result.sketches[0].curves[(index + 2) % 4];
    const from = [
      other.a.x + (other.b.x - other.a.x) * 0.25,
      other.a.y + (other.b.y - other.a.y) * 0.25,
    ];
    await chooseTool(page, "grid snap", "grid");
    await drag(page, from, [from[0] + 3, from[1] + 2], ["Shift"]);
    const moved = (await inspect(page)).document.sketches[0];
    const delta = {
      x: moved.curves[0].a.x - result.sketches[0].curves[0].a.x,
      y: moved.curves[0].a.y - result.sketches[0].curves[0].a.y,
    };
    assert.ok(
      Math.abs(delta.x - 3) < 0.12 && Math.abs(delta.y - 2) < 0.12,
      JSON.stringify({ index, from, delta }),
    );
    for (let i = 0; i < 4; i++)
      for (const end of ["a", "b"])
        pointEquals(moved.curves[i][end], [
          result.sketches[0].curves[i][end].x + delta.x,
          result.sketches[0].curves[i][end].y + delta.y,
        ]);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, result);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(
    `${name}: four rotated rectangle-side bows, automatic lock removal, filled profiles, rigid movement and Undo passed`,
  );
}
