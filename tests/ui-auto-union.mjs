import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function autoUnionRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(1120, 740);
    await page.mouse.click(center.x, center.y);
    await page.keyboard.press("e");
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    const state = await inspect(page);
    assert.equal(
      await page.getByRole("button", { name: "Union", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(state.preview.bodies.length, 1, "Automatic Union must join the touching body");
    close(state.preview.bodies[0].volume, 4000 * (i + 1));
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    assert.equal((await inspect(page)).document.bodies.length, 1);
  }
  await chooseTool(page, "undo", "undo");
  close((await inspect(page)).document.bodies[0].volume, 8000);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, 12000);
  console.log(
    `${name}: automatic Union joins repeated face extrusions, commit and Undo/Redo passed`,
  );
}
