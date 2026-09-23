import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function sourceSketchVisibilityRoute(page, name) {
  for (const tool of ["extrude", "revolve"]) {
    for (const coverage of ["single", "partial", "all"]) {
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("r");
      await drag(page, [5, -15], [15, -5]);
      if (coverage !== "single") await drag(page, [5, 5], [15, 15]);
      assert.equal(
        (await inspect(page)).document.sketches[0].groups.length,
        coverage === "single" ? 1 : 2,
      );
      const center = await at(page, 10, -10);
      const second = await at(page, 10, 10);
      const axis = await at(page, 0, -20);
      await chooseTool(page, "return to modeling", "modeling");
      const before = (await inspect(page)).document.sketches;
      const start = async (select = true) => {
        if (select) {
          await page.mouse.click(center.x, center.y);
          if (coverage === "all") {
            await page.keyboard.down("Shift");
            await page.mouse.click(second.x, second.y);
            await page.keyboard.up("Shift");
          }
        }
        if (tool === "extrude") {
          await chooseTool(page, "extrude", "extrude");
          await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
        } else {
          await chooseTool(page, "revolve", "revolve");
          await page.mouse.click(axis.x, axis.y);
        }
        assert.ok((await inspect(page)).preview?.bodies.length);
        assert.equal(
          await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).count(),
          1,
        );
      };
      await start();
      await page.keyboard.press("Escape");
      assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
      assert.equal(
        await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).count(),
        1,
      );
      await start(false);
      if (tool === "extrude") {
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
      } else await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
      const accepted = (await inspect(page)).document;
      assert.ok(accepted.bodies.length);
      assert.deepEqual(accepted.sketches, before);
      const eye = coverage === "partial" ? "Hide Sketch 1" : "Show Sketch 1";
      assert.equal(await page.getByRole("button", { name: eye, exact: true }).count(), 1);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
      assert.equal(
        await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).count(),
        1,
      );
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, accepted);
      assert.equal(await page.getByRole("button", { name: eye, exact: true }).count(), 1);
      if (coverage !== "partial")
        await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
      await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
      await page.keyboard.press("Enter");
      assert.ok((await inspect(page)).activeSketch);
      console.log(
        `${name}: ${tool} ${coverage} coverage, preview/cancel, accept, Undo/Redo and reopen passed`,
      );
    }
  }
}

export async function sourceSketchPreviewUndoRoute(page, name) {
  for (const tool of ["extrude", "revolve"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("r");
    await drag(page, [5, -15], [15, -5]);
    const center = await at(page, 10, -10);
    const axis = await at(page, 0, -20);
    await chooseTool(page, "return to modeling", "modeling");
    await page.mouse.click(center.x, center.y);
    if (tool === "extrude")
      await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    else {
      await chooseTool(page, "revolve", "revolve");
      await page.mouse.click(axis.x, axis.y);
    }
    assert.ok((await inspect(page)).preview?.bodies.length);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
    assert.equal(await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).count(), 1);
    await chooseTool(page, "redo", "redo");
    assert.ok((await inspect(page)).document.bodies.length);
    assert.equal(await page.getByRole("button", { name: "Show Sketch 1", exact: true }).count(), 1);
    console.log(`${name}: ${tool} Undo from active preview reveals source; Redo hides it`);
  }
}
