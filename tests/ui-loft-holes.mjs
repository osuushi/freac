import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function loftHolesRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [-12, 0], [-6, 0]);
  await drag(page, [-12, 0], [-10, 0]);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "New sketch on this plane", "new-sketch-on-plane");
  await page.keyboard.press("c");
  await drag(page, [12, 0], [16, 0]);
  await drag(page, [12, 0], [14, 0]);
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move sketch Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Translation Z", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Escape");
  await orient(page, [0, 0, 1]);
  const first = await project(page, [-8.5, 0, 0]);
  const second = await project(page, [15.5, 0, 10]);
  await page.mouse.click(first.x, first.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up("Shift");
  let state = await inspect(page);
  assert.equal(state.modelingSelection.length, 2);
  assert.ok(state.modelingSelection.every((section) => section.holes === 1));
  assert.deepEqual(
    state.document.sketches.map((s) => s.curves.map((c) => c.radius)),
    [
      [6, 2],
      [4, 2],
    ],
  );
  const original = state.document;
  await chooseTool(page, "loft", "loft");
  await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("ruled");
  state = await inspect(page);
  const volume = ((Math.PI * 10) / 3) * (36 + 24 + 16 - 4 - 4 - 4);
  assert.ok(
    Math.abs(state.preview.bodies[0].volume - volume) < 1e-5,
    JSON.stringify({
      actual: state.preview.bodies[0].volume,
      expected: volume,
      sketches: state.document.sketches,
    }),
  );
  await page.getByRole("button", { name: "Accept loft", exact: true }).click();
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].volume - volume) < 1e-5);
  // Only annuli participated; the source sketches' disk regions remain available.
  for (let i = 1; i <= 2; i++)
    assert.equal(
      await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).count(),
      1,
    );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: manually drawn annular sections, exact hollow Loft and partial-region visibility/Undo passed`,
  );
}
