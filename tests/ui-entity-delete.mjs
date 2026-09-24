import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { browseTools, chooseTool } from "./ui-tools.mjs";

export async function entityDeleteRoute(page, name) {
  await plate(page);
  const original = (await inspect(page)).document;
  const bodyId = original.bodies[0].id;
  const sketchId = original.sketches[0].id;
  await browseTools(page, "Select");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  assert.deepEqual((await inspect(page)).modelingSelection, [{ kind: "body", body: bodyId }]);
  await page.keyboard.press("Delete");
  let state = await inspect(page);
  assert.deepEqual(state.document.bodies, []);
  assert.equal(state.document.sketches[0]?.id, sketchId);
  assert.deepEqual(state.modelingSelection, []);
  let history = await page.evaluate(() => window.freacHistory());
  assert.deepEqual(history.at(-1).operation, {
    kind: "delete-entities",
    parameters: { bodyIds: [bodyId], sketchIds: [] },
  });
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  assert.deepEqual((await inspect(page)).modelingSelection, [{ kind: "sketch", sketch: sketchId }]);
  await page.keyboard.press("Backspace");
  state = await inspect(page);
  assert.deepEqual(state.document.bodies, []);
  assert.deepEqual(state.document.sketches, []);
  history = await page.evaluate(() => window.freacHistory());
  assert.deepEqual(history.at(-1).operation, {
    kind: "delete-entities",
    parameters: { bodyIds: [], sketchIds: [sketchId] },
  });
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0]?.id, sketchId);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: immediate body/sketch Delete and Backspace preserve separate sketches and Undo`,
  );
}
