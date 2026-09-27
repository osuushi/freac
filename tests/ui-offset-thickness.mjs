import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function offsetThicknessRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const radius of [8, 3]) {
    await page.keyboard.press("c");
    await drag(page, [0, 0], [radius, 0]);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(radius));
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  const region = await at(page, 5, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(region.x, region.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  close(original.bodies[0].volume, Math.PI * 55 * 10);
  await orient(page, [0, -0.4, 1]);
  await worldClick(page, [0, -8, 5]);
  const thickness = page.getByRole("textbox", { name: "Face thickness", exact: true });
  close(Number(await thickness.inputValue()), 5);
  await thickness.fill("6");
  let state = await inspect(page);
  close(state.preview.bodies[0].volume, Math.PI * 72 * 10);
  assert.deepEqual(state.document, original);
  await page.screenshot({ path: ".cache/sketch-review/offset-thickness.png" });
  const toggle = page.getByRole("button", { name: "Switch offset measurement" });
  await toggle.click();
  const relative = page.getByRole("textbox", { name: "Face offset distance" });
  close(Number(await relative.inputValue()), 1);
  close((await inspect(page)).preview.bodies[0].volume, Math.PI * 72 * 10);
  await relative.fill("-1");
  await inspect(page);
  await toggle.click();
  close(Number(await thickness.inputValue()), 4);
  await thickness.fill("0");
  await inspect(page);
  assert.equal(await page.getByRole("button", { name: "Accept face offset" }).isEnabled(), false);
  await thickness.fill("6");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].volume, Math.PI * 72 * 10);
  close(Number(await thickness.inputValue()), 6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 72 * 10);
  // Reselect the inner wall and use the same absolute thickness convention.
  await worldClick(page, [0, 3, 5]);
  state = await inspect(page);
  assert.equal(
    state.modelingSelection[0]?.face,
    state.document.bodies[0].faces.find((face) => face.cylinder?.radius === 3)?.id,
  );
  close(Number(await thickness.inputValue()), 6);
  await thickness.fill("7");
  state = await inspect(page);
  close(state.preview.bodies[0].volume, Math.PI * 77 * 10);
  await page.keyboard.press("Escape");
  close((await inspect(page)).document.bodies[0].volume, Math.PI * 72 * 10);
  console.log(
    "Concentric thickness: absolute/relative, outer/inner, invalid recovery, accept/cancel and Undo/Redo passed",
  );
}
