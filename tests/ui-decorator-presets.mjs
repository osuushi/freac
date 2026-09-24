import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function decoratorPresetRoute(page, name) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  const nozzle = page.getByRole("spinbutton", { name: "Nozzle diameter", exact: true });
  const advanced = page.locator("details.thread-advanced");
  assert.equal(await preset.inputValue(), "fdm-fine");
  assert.equal(await clearance.inputValue(), "0.05");
  assert.equal(await pitch.isVisible(), false);
  assert.equal(await advanced.evaluate((element) => element.open), false);
  assert.match(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /0\.05 mm for vertical prints.*0 mm may suit horizontal holes/,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-fdm-fine-controls.png` });
  await preset.selectOption("fdm-coarse");
  let settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 1);
  assert.equal(settings.profile, "triangle");
  assert.equal(settings.clearance, 0.05);
  await clearance.fill("0");
  await clearance.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.clearance, 0);
  await preset.selectOption("fdm-fine");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 0.5);
  assert.equal(settings.clearance, 0.05);
  assert.equal(await nozzle.count(), 0);
  await preset.selectOption("print-sideways");
  await inspect(page);
  assert.equal(await nozzle.isVisible(), false);
  await advanced.locator("summary").click();
  assert.equal(await nozzle.inputValue(), "0.4");
  await nozzle.fill("0.6");
  await nozzle.press("Escape");
  assert.equal((await inspect(page)).document.decorators[0].settings.nozzleDiameter, 0.4);
  await nozzle.fill("0.6");
  await nozzle.press("Enter");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.nozzleDiameter, 0.6);
  assert.equal(settings.pitch, 3);
  assert.equal(settings.clearance, 0.3);
  assert.equal(settings.profile, "rounded");
  await preset.selectOption("metric");
  await inspect(page);
  assert.equal(await nozzle.count(), 0);
  assert.equal(await pitch.isVisible(), true);
}
