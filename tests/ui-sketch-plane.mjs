import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function sketchPlaneRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-12, -8], [12, 8]);
  const first = (await inspect(page)).document.sketches[0];
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  assert.equal((await inspect(page)).activeSketch, first.id, "A visible plane sketch is reopened");
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await chooseTool(page, "new sketch on this plane", "new-sketch-on-plane");
  await page.keyboard.press("l");
  await drag(page, [-8, 0], [8, 0]);
  const two = (await inspect(page)).document.sketches;
  assert.equal(two.length, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  assert.equal(await page.locator(".entity-row.entity-mergeable").count(), 1);
  assert.equal(
    await page
      .getByRole("button", { name: "Merge Sketch 2 into selected sketch", exact: true })
      .isVisible(),
    true,
  );
  await page
    .getByRole("button", { name: "Merge Sketch 2 into selected sketch", exact: true })
    .click();
  let state = await inspect(page);
  assert.equal(state.document.sketches.length, 1);
  assert.equal(state.document.sketches[0].id, first.id);
  assert.equal(state.document.sketches[0].curves.length, 5);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 2);
  await chooseTool(page, "redo", "redo");
  state = await inspect(page);
  assert.equal(state.document.sketches.length, 1);
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  assert.equal((await inspect(page)).activeSketch, null, "A hidden plane sketch is not reopened");
  await page.screenshot({ path: `.cache/sketch-review/${name}-sketch-plane.png` });
  console.log(
    `${name}: visible plane reuse, same-plane merge/highlight and hidden exclusion passed`,
  );
}
