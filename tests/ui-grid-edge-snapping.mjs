import assert from "node:assert/strict";
import { click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function gridEdgeSnappingRoute(page, name) {
  for (const horizontal of [false, true]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    const status = await page.getByRole("status").textContent();
    const step = Number(status.match(/([\d.]+) mm grid/)[1]);
    const scaled = (p) => p.map((n) => n * step);
    await page.keyboard.press("l");
    await drag(page, [0, 0], scaled([20, horizontal ? 0 : 10]), ["Shift"]);
    const base = (await inspect(page)).document;
    const cases = horizontal
      ? [[[7.3, 0.1], [7, 0], true]]
      : [
          [[7.1, 3.58], [7, 3.5], true],
          [[7.05, 3.96], [7, 4], false],
        ];
    for (const [pointer, expected, attached] of cases) {
      await page.keyboard.press("l");
      await drag(page, scaled([3, -8]), scaled(pointer));
      const drawn = (await inspect(page)).document;
      const sketch = drawn.sketches[0];
      pointEquals(sketch.curves[1].b, scaled(expected));
      assert.equal(
        sketch.constraints.some((c) => c.kind === "point-on-edge"),
        attached,
      );
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, base);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, drawn);
      await chooseTool(page, "undo", "undo");
    }
    // The same policy applies at the start of creation.
    await page.keyboard.press("l");
    const pointer = horizontal ? [7.3, 0.1] : [7.1, 3.58];
    const expected = horizontal ? [7, 0] : [7, 3.5];
    await drag(page, scaled(pointer), scaled([3, -8]));
    pointEquals((await inspect(page)).document.sketches[0].curves[1].a, scaled(expected));
    await page.keyboard.press("v");
    await click(page, ...scaled([3, -8]));
    await drag(page, scaled([3, -8]), scaled([4, -9]), ["Shift"]);
    pointEquals((await inspect(page)).document.sketches[0].curves[1].b, scaled([4, -9]));
  }
  console.log(
    `${name}: grid/edge intersections, off-edge grid corners, collinear edges, attachment, editing and Undo passed`,
  );
}
