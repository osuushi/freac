import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function decoratorPresetRoute(page, name) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const clearance = page.getByRole("spinbutton", { name: "Clearance", exact: true });
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  const nozzle = page.getByRole("spinbutton", { name: "Nozzle diameter", exact: true });
  const advanced = page.locator("details.thread-advanced");
  assert.equal(await preset.inputValue(), "fdm-fine");
  assert.equal(await clearance.inputValue(), "0.25");
  assert.equal(await pitch.isVisible(), false);
  assert.equal(await advanced.evaluate((element) => element.open), false);
  assert.match(
    await page.getByRole("region", { name: "Decorators", exact: true }).innerText(),
    /FDM fine starts at 0\.25 mm.*adjust for your printer and orientation/,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-fdm-fine-controls.png` });
  await preset.selectOption("fdm-coarse");
  let settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 1.5);
  assert.equal(settings.profile, "triangle");
  assert.equal(settings.clearance, 0.05);
  assert.equal(settings.tipTruncation, 0.1);
  await clearance.fill("0");
  await clearance.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.clearance, 0);
  await preset.selectOption("fdm-fine");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.pitch, 1);
  assert.equal(settings.clearance, 0.25);
  assert.equal(settings.tipTruncation, 0.1);
  await advanced.locator("summary").click();
  const tip = page.getByRole("spinbutton", { name: "Tip truncation", exact: true });
  assert.equal(await tip.inputValue(), "0.1");
  await tip.fill("0.2");
  await tip.press("Enter");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.tipTruncation, 0.2);
  assert.equal(settings.preset, "custom");
  await chooseTool(page, "undo", "undo");
  settings = (await inspect(page)).document.decorators[0].settings;
  assert.equal(settings.tipTruncation, 0.1);
  assert.equal(settings.preset, "fdm-fine");
  await advanced.locator("summary").click();
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
