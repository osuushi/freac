import assert from "node:assert/strict";
import { resolve } from "node:path";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function customDecoratorRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  await chooseTool(page, "decorator library", "decorator-library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(resolve("examples/decorators/raised-pad.json"));
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Apply Raised pad", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
  await height.fill("2");
  await height.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 2);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 1);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 2);
}
