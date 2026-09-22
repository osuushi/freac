import assert from "node:assert/strict";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
export async function typedSelectionRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  let state = await inspect(page);
  assert.equal(state.selectionTargets[0].kind, "group");
  await page.keyboard.press("v");
  await click(page, 6, 0);
  state = await inspect(page);
  assert.equal(state.selectionTargets.length, 1);
  assert.equal(state.selectionTargets[0].kind, "curve");
  assert.equal(state.selectedCurves.length, 1);
  await click(page, 0, 0);
  state = await inspect(page);
  assert.equal(state.selectionTargets[0].kind, "group-handle");
  assert.equal(state.selectedCurves.length, 0);
  await page.keyboard.down("Shift");
  await click(page, 7, 4);
  await page.keyboard.up("Shift");
  state = await inspect(page);
  assert.deepEqual(
    state.selectionTargets.map((t) => t.kind),
    ["group-handle", "group"],
  );
  assert.equal(state.selectedCurves.length, 4);
  await page.keyboard.down("Control");
  await click(page, 7, 4);
  await page.keyboard.up("Control");
  state = await inspect(page);
  assert.deepEqual(
    state.selectionTargets.map((t) => t.kind),
    ["group-handle"],
  );
  assert.equal(state.selectedCurves.length, 0);
  console.log(
    `${name}: typed point/edge/group targets, additive group/toggle and independent point ownership passed`,
  );
}
