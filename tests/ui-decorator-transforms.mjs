import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function decoratorTransformRoute(page) {
  const before = (await inspect(page)).document;
  const settings = before.decorators[0].settings;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  let state = await inspect(page);
  assert.deepEqual(state.document, before);
  assert.deepEqual(state.preview.decorators[0].settings, settings);
  assert.equal(state.preview.decorators[0].problem, undefined);
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  state = await inspect(page);
  assert.ok(state.document.bodies[0].volume > before.bodies[0].volume * 3);
  assert.deepEqual(state.document.decorators[0].settings, settings);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).uncheck();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  await inspect(page);
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  state = await inspect(page);
  assert.match(state.document.decorators[0].problem, /cylindrical/);
  const repair = page.getByRole("button", {
    name: "Use selected faces for these threads",
    exact: true,
  });
  assert.ok(await repair.isDisabled());
  await page.getByRole("button", { name: "Select affected geometry", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  assert.ok(await repair.isDisabled());
  await page.getByRole("button", { name: "Remove unresolved threads", exact: true }).click();
  assert.equal((await inspect(page)).document.decorators.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.match((await inspect(page)).document.decorators[0].problem, /cylindrical/);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await clearSelection(page);
}
