import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function agentMenuRoute(page) {
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await browseTools(page, "Select");
  assert(await page.getByRole("dialog", { name: "Find a tool" }).isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), false);
  await browseTools(page, "Select");
  await chooseTool(page, "clear selection", "selection-clear");
  assert.equal((await inspect(page)).modelingSelection.length, 0);
}
