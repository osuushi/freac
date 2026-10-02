import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { modalPlacementHistory } from "./ui-modal-move-history.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { startScale } from "./ui-scale.mjs";
import { chooseTool } from "./ui-tools.mjs";

const volume = (state) => (state.preview ?? state.document).bodies[0].volume;
async function roundTrip(page, kind, baseline, expected) {
  await chooseTool(page, "undo", "undo");
  let state = await inspect(page);
  assert.equal(state.interaction.kind, kind);
  close(volume(state), baseline);
  await chooseTool(page, "redo", "redo");
  state = await inspect(page);
  assert.equal(state.interaction.kind, kind);
  close(volume(state), expected);
}
await withUiRuntimes(
  async (page, name) => {
    const { center } = await plate(page);
    const original = (await inspect(page)).document;
    const radius = page.getByRole("textbox", { name: "Fillet radius", exact: true });
    await radius.fill("1");
    let state = await inspect(page);
    const fillet = volume(state);
    await roundTrip(page, "body-edge-finish", original.bodies[0].volume, fillet);
    await page.getByRole("button", { name: "Switch to chamfer", exact: true }).click();
    state = await inspect(page);
    const chamfer = volume(state);
    assert.ok(Math.abs(chamfer - fillet) > 1);
    await roundTrip(page, "body-edge-finish", fillet, chamfer);
    await page.keyboard.press("Escape");
    await inspect(page);
    await page.mouse.click(center.x + 30, center.y + 30);
    await page.keyboard.press("o");
    const offset = await relativeOffsetInput(page);
    await offset.fill("2");
    state = await inspect(page);
    close(volume(state), 4800);
    await roundTrip(page, "face-offset", 4000, 4800);
    await page.keyboard.press("Escape");
    await inspect(page);
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await startScale(page);
    const factor = 1.123456789123;
    const input = page.getByRole("textbox", { name: "Transform scale X", exact: true });
    await input.fill(String(factor));
    state = await inspect(page);
    close(volume(state), 4000 * factor ** 3);
    await roundTrip(page, "scale", 4000, 4000 * factor ** 3);
    assert.equal(Number(await input.inputValue()), factor);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    await modalPlacementHistory(page);
    console.log(`${name}: Fillet/Chamfer mode, Face Offset and precise Scale local history passed`);
  },
  { defaults: ["chromium"], timeout: 30000 },
);
