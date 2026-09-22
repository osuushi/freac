import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function fixtureRoute(page, name) {
  await plate(page);
  await chooseTool(page, "chamfer", "chamfer");
  await page.getByRole("textbox", { name: "Chamfer distance" }).fill("2");
  const before = await inspect(page);
  const history = JSON.parse(JSON.stringify(await page.evaluate(() => window.freacHistory())));
  await chooseTool(page, "capture fixture", "capture");
  const pathField = page.getByRole("textbox", { name: "Captured fixture path" });
  await pathField.waitFor({ state: "visible" });
  const storedBefore = JSON.parse(JSON.stringify(before));
  const path = await pathField.inputValue(),
    fixture = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(fixture.snapshot.document, storedBefore.document);
  assert.deepEqual(fixture.snapshot.preview, storedBefore.preview);
  assert.deepEqual(fixture.snapshot.modelingSelection, before.modelingSelection);
  assert.equal(fixture.snapshot.lastEdit.kind, "finish-edges");
  assert.deepEqual(fixture.snapshot.history, history);
  assert.ok(history.some((entry) => entry.operation.kind === "extrude"));
  const after = await inspect(page);
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(after.preview, before.preview);
  assert.deepEqual(after.interaction, before.interaction);
  const accepted = JSON.parse(await readFile(join(dirname(path), "accepted.freac"), "utf8"));
  const preview = JSON.parse(await readFile(join(dirname(path), "preview.freac"), "utf8"));
  assert.deepEqual(accepted.document, storedBefore.document);
  assert.deepEqual(preview.document, storedBefore.preview);
  await chooseTool(page, "capture fixture", "capture");
  await page.waitForFunction(
    (p) => document.querySelector('[aria-label="Captured fixture path"]').value !== p,
    path,
  );
  console.log(
    `${name}: fixture capture saves accepted/preview geometry and edit context without changing the live tool`,
  );
  await page.keyboard.press("Escape");
  await inspect(page);
}
