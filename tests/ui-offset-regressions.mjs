import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function offsetAdjacentRoute(page, name) {
  for (const curve of [
    { kind: "segment", a: { x: -5, y: 0 }, b: { x: 5, y: 0 } },
    { kind: "circle", center: { x: 0, y: 0 }, radius: 5 },
    { kind: "arc", a: { x: -5, y: 0 }, b: { x: 5, y: 0 }, bulge: -1 },
  ]) {
    await reset(page);
    const sketch = {
      id: "analytic",
      plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
      curves: [{ ...curve, id: "source", construction: false }],
      constraints: [],
      groups: [],
    };
    await openDocument(page, {
      name: "analytic.freac",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "freac",
          version: 1,
          document: { units: "mm", sketches: [sketch] },
        }),
      ),
    });
    await inspect(page);
    await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
    await inspect(page);
    await page.keyboard.press("Meta+a");
    await chooseTool(page, "offset sketch curves", "sketch-offset");
    await page.getByRole("textbox", { name: "Offset distance" }).fill("2");
    await page.keyboard.press("Enter");
    const result = (await inspect(page)).document.sketches[0];
    assert.deepEqual(result.curves[0], sketch.curves[0]);
    assert.equal(result.curves.length, 2);
    const copy = result.curves[1];
    if (copy.kind === "circle") assert.equal(copy.radius, 7);
    else if (copy.kind === "arc") {
      assert.ok(Math.abs(copy.a.x + 7) < 1e-7 && Math.abs(copy.b.x - 7) < 1e-7);
      assert.equal(copy.bulge, -1);
    } else assert.ok(Math.abs(copy.a.y - 2) < 1e-7 && Math.abs(copy.b.y - 2) < 1e-7);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document.sketches[0], sketch);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document.sketches[0], result);
  }
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.getByRole("button", { name: "Offset loop", exact: true }).click();
  await page.getByRole("textbox", { name: "Offset distance" }).fill("2");
  await page.keyboard.press("Enter");
  const rectangle = (await inspect(page)).document.sketches[0];
  assert.equal(rectangle.curves.length, 8);
  for (const c of rectangle.curves.slice(4)) {
    assert.ok(Math.abs(Math.abs(c.a.x) - 12) < 1e-7);
    assert.ok(Math.abs(Math.abs(c.a.y) - 8) < 1e-7);
  }
  await page.keyboard.press("v");
  await click(page, 0, 8);
  await drag(page, [0, 8], [0, 10], ["Shift"]);
  assert.notDeepEqual((await inspect(page)).document.sketches[0], rectangle);
  console.log(
    `${name}: analytic line/circle/arc and rectangle offsets, history and editing passed`,
  );
}
