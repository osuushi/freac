import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { hold, releaseChoice } from "./ui-overlap-gesture.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function overlapRegions(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [20, 10]);
  await page.keyboard.press("l");
  await drag(page, [0, -10], [0, 10]);
  await page.keyboard.press("Escape");
  await chooseTool(page, "return to modeling", "modeling");
  await orient(page, [0, 0, 1]);
  const original = (await inspect(page)).document;
  // Stay outside the centered extrusion handle after selecting the first cell.
  const point = await project(page, [-10, 6, 0]);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await hold(page, point);
  assert.equal(await panel.getByRole("button", { name: "Region", exact: true }).count(), 1);
  assert.equal(
    await panel.getByRole("button", { name: "Connected regions", exact: true }).count(),
    1,
  );
  await releaseChoice(page, "Region");
  let selected = (await inspect(page)).modelingSelection;
  assert.equal(selected.length, 1);
  assert.equal(selected[0].kind, "profile");
  await hold(page, point);
  await panel.getByRole("button", { name: "Connected regions", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-connected-regions.png` });
  await page.mouse.up();
  selected = (await inspect(page)).modelingSelection;
  assert.equal(selected.length, 2);
  assert.ok(selected.every((t) => t.kind === "profile"));
  await page.keyboard.down("Control");
  await hold(page, point);
  await releaseChoice(page, "Connected regions");
  await page.keyboard.up("Control");
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  assert.deepEqual((await inspect(page)).document, original);
  await hold(page, point);
  await releaseChoice(page, "Connected regions");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const bodies = (await inspect(page)).document.bodies;
  assert.ok(Math.abs(bodies.reduce((sum, body) => sum + body.volume, 0) - 4000) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await hold(page, point);
  assert.equal(await panel.getByRole("button", { name: "Region", exact: true }).count(), 0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  console.log(
    name,
    "exact region, connected set, toggle, extrusion/Undo and hidden-sketch hold selection passed",
  );
}
