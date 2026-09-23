import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
export async function mixedSelectionRoute(page, name, electron) {
  await plate(page);
  await button(page, "Select Body 1").click();
  await chooseTool(page, "duplicate bodies", "duplicate");
  await button(page, "Move body X").click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  assert.equal(original.bodies.length, 2);
  await button(page, "Select Body 1").click();
  await page.keyboard.down("Shift");
  await worldClick(page, [30, 0, 10]);
  await page.keyboard.up("Shift");
  const selection = (await inspect(page)).modelingSelection;
  assert.deepEqual(
    selection.map((t) => t.kind),
    ["body", "face"],
  );
  assert.equal((await inspect(page)).modelingTool, null);
  await chooseTool(page, "transform", "transform");
  await button(page, "Move faces Z").click();
  await page.getByRole("textbox", { name: "Face translation Z", exact: true }).fill("2");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  const whole = state.preview.bodies.find((b) => b.id === selection[0].body);
  const partial = state.preview.bodies.find((b) => b.id === selection[1].body);
  close(whole.center[2], 7);
  close(whole.volume, 4000);
  close(partial.volume, 4800);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.deepEqual(state.document.bodies, [whole, partial]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual((await inspect(page)).modelingSelection, selection);
  await page.keyboard.press("Delete");
  state = await inspect(page);
  assert.deepEqual(
    state.document,
    original,
    "Unhealable face deletion must not remove the whole selected body",
  );
  assert.deepEqual(state.modelingSelection, selection);
  assert.equal((await page.evaluate(() => window.freacHistory())).at(-1).outcome, "failed");
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.bodies, [whole, partial]);
  await bodyArchiveRoute(page, `${name}-mixed-selection`, electron);
  await button(page, "Select Body 1").click();
  await chooseTool(page, "only faces", "selection-only-faces");
  assert.equal((await inspect(page)).modelingTool, "move");
  await button(page, "Move body X").click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("1");
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].center[0], whole.center[0] + 1);
  console.log(
    `${name}: mixed body/face Move preview, atomic acceptance/Undo and failed Delete preserve all targets`,
  );
}
