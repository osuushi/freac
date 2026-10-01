import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

function sameDrawables(before, after, label) {
  const delta = {
    created: after.created - before.created,
    disposed: after.disposed - before.disposed,
  };
  if (process.env.FREAC_RENDER_BASELINE === "1") console.log(`${label}:`, delta);
  else {
    assert.deepEqual(delta, { created: 0, disposed: 0 }, label);
    assert.deepEqual(
      after.faces.map((face) => face.geometry),
      before.faces.map((face) => face.geometry),
      label,
    );
  }
}

await withUiRuntimes(
  async (page, name) => {
    await plate(page);
    await clearSelection(page);
    await page.mouse.move(1100, 750);
    let state = await inspect(page),
      before = state.bodyRendering;
    assert.equal(before.faces.length, 6);
    await worldClick(page, [4, 4, 10]);
    state = await inspect(page);
    assert.equal(state.modelingSelection[0].kind, "face");
    assert.equal(
      state.bodyRendering.faces.find((face) => face.face === state.modelingSelection[0].face).color,
      "82b5e0",
    );
    sameDrawables(before, state.bodyRendering, `${name} selection`);
    before = state.bodyRendering;
    await page.mouse.move(1100, 750);
    await inspect(page);
    await page.mouse.move(640, 470);
    state = await inspect(page);
    sameDrawables(before, state.bodyRendering, `${name} hover`);
    before = state.bodyRendering;
    await chooseTool(page, "Hide bodies", "hide-bodies");
    state = await inspect(page);
    sameDrawables(before, state.bodyRendering, `${name} hide`);
    if (process.env.FREAC_RENDER_BASELINE !== "1")
      assert.ok(state.bodyRendering.faces.every((face) => !face.visible));
    await chooseTool(page, "Show bodies", "show-bodies");
    state = await inspect(page);
    sameDrawables(before, state.bodyRendering, `${name} show`);
    await page.screenshot({ path: `.cache/sketch-review/${name}-body-drawable.png` });
    if (process.env.FREAC_RENDER_BASELINE !== "1") await bodyMutation(page, name);
    console.log(`${name}: body drawable inspection complete`);
  },
  { allowed: ["chromium", "webkit", "electron"] },
);

async function bodyMutation(page, name) {
  await worldClick(page, [4, 4, 10]);
  const before = (await inspect(page)).bodyRendering;
  const start = async () => {
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("1");
    const state = await inspect(page);
    assert.ok(state.bodyRendering.created > before.created);
    assert.notDeepEqual(
      state.bodyRendering.faces.map((face) => face.geometry),
      before.faces.map((face) => face.geometry),
    );
    assert.ok(Math.abs(state.preview.bodies[0].volume - 4400) < 1e-6);
  };
  await start();
  await page.keyboard.press("Escape");
  assert.ok(Math.abs((await inspect(page)).document.bodies[0].volume - 4000) < 1e-6);
  await start();
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  for (let cycle = 0; cycle < 3; cycle++) {
    await chooseTool(page, "undo", "undo");
    assert.ok(Math.abs((await inspect(page)).document.bodies[0].volume - 4000) < 1e-6);
    await chooseTool(page, "redo", "redo");
    const state = await inspect(page);
    assert.ok(Math.abs(state.document.bodies[0].volume - 4400) < 1e-6);
    assert.equal(
      state.bodyRendering.created - state.bodyRendering.disposed,
      state.bodyRendering.faces.length,
      "only current face resources remain owned",
    );
  }
  console.log(
    `${name}: changed geometry rebuild, cancel, acceptance and repeated Undo/Redo dispose superseded face resources`,
  );
}
