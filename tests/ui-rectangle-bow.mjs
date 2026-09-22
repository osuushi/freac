import assert from "node:assert/strict";
import { at, click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { rectangleBowSides } from "./ui-rectangle-bow-sides.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function rectangleBowRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await page.getByRole("button", { name: `Sketch on ${plane}` }).click();
    await page.keyboard.press("r");
    await drag(page, [-10, -5], [10, 5]);
    await chooseTool(page, "select", "select");
    const original = (await inspect(page)).document;
    await click(page, -5, -5);
    assert.deepEqual((await inspect(page)).selection, [original.sketches[0].curves[0].id]);
    const handles = await page.locator(".bow-handle").all();
    assert.equal(handles.length, 2);
    const target = await at(page, 0, -30);
    const boxes = await Promise.all(handles.map((h) => h.boundingBox()));
    boxes.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
    );
    const b = boxes[0];
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    const major = (await inspect(page)).document;
    assert.ok(Math.abs(major.sketches[0].curves[0].bulge) > 1);
    assert.equal(await page.getByRole("button", { name: "Remove and bow" }).count(), 0);
    const radius = page.getByRole("textbox", { name: "Radius", exact: true });
    await radius.fill("5");
    await page.keyboard.press("Enter");
    assert.equal(await radius.getAttribute("aria-invalid"), "true");
    assert.deepEqual((await inspect(page)).document, major);
    await radius.fill("20");
    await page.keyboard.press("Enter");
    assert.ok(Math.abs((await inspect(page)).document.sketches[0].curves[0].bulge) > 1);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await click(page, -5, -5);
    let guide = await page.locator(".bow-handle").first().boundingBox();
    await page.mouse.click(guide.x + guide.width / 2, guide.y + guide.height / 2);
    await page.getByRole("textbox", { name: "Bow radius" }).fill("15");
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    guide = await page.locator(".bow-handle").first().boundingBox();
    await page.mouse.click(guide.x + guide.width / 2, guide.y + guide.height / 2);
    await page.getByRole("textbox", { name: "Bow radius" }).fill("15");
    await page.keyboard.press("Enter");
    const accepted = (await inspect(page)).document;
    const sketch = accepted.sketches[0],
      arc = sketch.curves[0];
    assert.equal(sketch.groups.length, 0);
    assert.equal(arc.kind, "arc");
    pointEquals(arc.a, [-10, -5]);
    pointEquals(arc.b, [10, -5]);
    assert.equal(sketch.constraints.filter((c) => c.kind === "coincident").length, 4);
    assert.equal(sketch.constraints.filter((c) => c.kind === "perpendicular").length, 1);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("18");
    await page.keyboard.press("Enter");
    pointEquals((await inspect(page)).document.sketches[0].curves[0].a, [-10, -5]);
    await chooseTool(page, "select", "select");
    await drag(page, [-10, -5], [-12, -5], ["Shift"]);
    const edited = (await inspect(page)).document.sketches[0];
    pointEquals(edited.curves[0].a, [-12, -5]);
    pointEquals(edited.curves[3].b, [-12, -5]);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
  }
  await rectangleBowSides(page, name);
  console.log(
    `${name}: rectangle-side bow numeric acceptance, drag cancellation, surviving constraints, radius edits and history passed`,
  );
}
