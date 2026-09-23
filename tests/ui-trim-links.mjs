import assert from "node:assert/strict";
import { click, drag, inspect, inspectPointChoices, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
export async function trimCornerLinkRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  // Dimensions from the founder's captured two-circle trim fixture.
  await page.keyboard.press("c");
  await drag(page, [-6, 0], [2, 0]);
  await page.keyboard.press("c");
  await drag(page, [20, 6], [42, 12]);
  await page.keyboard.press("t");
  await click(page, 20 - Math.sqrt(520), 6);
  const firstTrim = await data(page);
  assert.equal(firstTrim.constraints.length, 0);
  await click(page, 2, 0);
  const fused = await data(page);
  assert.equal(fused.curves.filter((c) => c.kind === "arc").length, 2);
  assert.equal(fused.constraints.filter((c) => c.kind === "coincident").length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), firstTrim);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual(await data(page), fused);
  await page.keyboard.press("v");
  const corner = fused.curves[0].b;
  await click(page, corner.x, corner.y);
  await inspectPointChoices(page, corner.x, corner.y);
  await page
    .getByRole("group", { name: "Choose coincident points" })
    .getByRole("button", { name: "Point 1", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await drag(page, [corner.x, corner.y], [2, -8], ["Shift"]);
  const moved = await data(page);
  pointEquals(moved.curves[0].b, [2, -8]);
  pointEquals(moved.curves[1].a, [2, -8]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), fused);
  await click(page, corner.x, corner.y);
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  assert.equal((await data(page)).constraints.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), fused);
  console.log(
    `${name}: fixture circle trims auto Fuse both corners; narrowed drag, Unfuse and Undo/Redo passed`,
  );
}
