import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function decoratorPresetRoute(page) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const nozzle = page.getByRole("spinbutton", { name: "Nozzle diameter", exact: true });
  assert.equal(await nozzle.count(), 0);
  await preset.selectOption("print-sideways");
  await inspect(page);
  assert.equal(await nozzle.inputValue(), "0.4");
  await nozzle.fill("0.6");
  await nozzle.press("Escape");
  assert.equal((await inspect(page)).document.decorators[0].settings.nozzleDiameter, 0.4);
  await nozzle.fill("0.6");
  await nozzle.press("Enter");
  const settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.nozzleDiameter, 0.6);
  assert.equal(settings.pitch, 3);
  assert.equal(settings.clearance, 0.3);
  assert.equal(settings.profile, "rounded");
  await preset.selectOption("metric");
  await inspect(page);
  assert.equal(await nozzle.count(), 0);
}
