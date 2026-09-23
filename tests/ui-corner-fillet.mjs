import assert from "node:assert/strict";
import { click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function cornerFilletRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("r");
    await drag(page, [0, 0], [20, 10]);
    await chooseTool(page, "select", "select");
    await click(page, 0, 0);
    const before = (await inspect(page)).document;
    await chooseTool(page, "fillet sketch", "sketch-fillet");
    await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
    await page.keyboard.press("Enter");
    let sketch = (await inspect(page)).document.sketches[0];
    assert.equal(sketch.groups.length, 0);
    assert.equal(sketch.curves.length, 5);
    const arc = sketch.curves.find((c) => c.kind === "arc");
    assert.ok(arc);
    assert.match(await page.getByRole("status").textContent(), /Shape adjusted.*Undo/);
    assert.equal(await page.getByRole("button", { name: "Remove and fillet" }).count(), 0);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
    await page.keyboard.press("Enter");
    sketch = (await inspect(page)).document.sketches[0];
    pointEquals(sketch.curves[0].a, [3, 0]);
    pointEquals(sketch.curves[3].b, [0, 3]);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 10]);
  await chooseTool(page, "select", "select");
  await click(page, 0, 0);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  console.log(
    `${name}: direct rectangle and line-junction fillets, automatic conversion, radius edits and Undo passed`,
  );
}
