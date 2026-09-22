import assert from "node:assert/strict";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function filletConsumptionRoute(page, name) {
  for (const [width, mode] of [
    [20, "type"],
    [20, "drag"],
    [20, "edit"],
    [20, "both"],
  ]) {
    await reset(page);
    await page.getByRole("button", { name: "Sketch on XY" }).click();
    await page.keyboard.press("r");
    await drag(page, [0, 0], [width, 10]);
    await page.keyboard.press("v");
    await click(page, 0, 0);
    const before = (await inspect(page)).document;
    if (mode === "drag") {
      const from = await filletGuidePoint(page);
      const to = await at(page, 8, 8);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    } else {
      await chooseTool(page, "fillet sketch", "sketch-fillet");
      await page
        .getByRole("textbox", { name: "Fillet radius", exact: true })
        .fill(mode === "edit" ? "2" : mode === "both" ? "40" : "10");
      await page.keyboard.press("Enter");
      if (mode === "edit") {
        await page.getByRole("textbox", { name: "Radius", exact: true }).fill("10");
        await page.keyboard.press("Enter");
      }
    }
    const sketch = (await inspect(page)).document.sketches[0];
    assert.equal(
      sketch.curves.length,
      mode === "drag" || mode === "both" ? 3 : 4,
      await page.getByRole("status").textContent(),
    );
    assert.equal(sketch.curves.filter((c) => c.kind === "arc").length, 1);
    const endpoints = sketch.curves.flatMap((c) => [c.a, c.b]);
    assert.ok(
      endpoints.every(
        (p) => endpoints.filter((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6).length === 2,
      ),
      "Consumed rectangle remains a closed loop",
    );
    if (mode === "both") {
      const old = before.sketches[0].curves;
      assert.deepEqual(
        sketch.curves.filter((c) => c.kind === "segment"),
        [old[1], old[2]],
        "The other two rectangle sides stay untouched",
      );
      await page.screenshot({ path: `.cache/sketch-review/${name}-rounding-consumed.png` });
    }
    await chooseTool(page, "undo", "undo");
    if (mode === "edit") await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(
    `${name}: fillet consumes one/both supports via type/drag/existing radius; closure and Undo passed`,
  );
}
