import assert from "node:assert/strict";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function tangentBowRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  const before = (await inspect(page)).document;
  const sketch = before.sketches[0];
  const line = sketch.curves[0];
  assert.equal(sketch.constraints.filter((c) => c.kind === "tangent").length, 2);
  for (const numeric of [false, true]) {
    await click(page, 25, 20);
    await click(page, 11, 0);
    const handle = await page.locator(".bow-handle").first().boundingBox();
    await page.mouse.move(handle.x, handle.y);
    if (numeric) {
      await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.getByRole("textbox", { name: "Radius", exact: true }).fill("12");
      await page.keyboard.press("Enter");
    } else {
      const target = await at(page, 11, -4);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 8 });
      await page.mouse.up();
    }
    const after = (await inspect(page)).document;
    const changed = after.sketches[0];
    assert.equal(changed.curves[0].kind, "arc", await page.getByRole("status").textContent());
    assert.deepEqual(changed.curves[0].a, line.a);
    assert.deepEqual(changed.curves[0].b, line.b);
    assert.deepEqual(changed.curves.slice(1), sketch.curves.slice(1));
    assert.deepEqual(
      changed.constraints,
      sketch.constraints.filter(
        (c) =>
          c.kind === "coincident" || !(c.curve === line.id || c.a === line.id || c.b === line.id),
      ),
    );
    assert.match(await page.getByRole("status").textContent(), /constraint.*removed.*Undo/);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, after);
    await chooseTool(page, "undo", "undo");
    await inspect(page);
  }
  console.log(
    `${name}: tangent line bow drag/type, fixed endpoints, retained peer constraints and Undo/Redo passed`,
  );
}
