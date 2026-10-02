import assert from "node:assert/strict";
import { at, close, drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function extrudeRectangle(page, plane, from, to) {
  await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
  await page.keyboard.press("r");
  await drag(page, from, to);
  const center = await at(page, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "extrude", "extrude");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  const pending = await inspect(page);
  await page.keyboard.press("Meta+Shift+a");
  assert.deepEqual((await inspect(page)).modelingSelection, pending.modelingSelection);
  await page.keyboard.press("Meta+f");
  await page.getByRole("combobox", { name: "Find a tool" }).fill("select all bodies");
  assert.equal(
    await page.locator('[data-command="select-all-bodies"]').getAttribute("aria-disabled"),
    "true",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await inspect(page);
}

async function run(page, name) {
  await inspect(page);
  await extrudeRectangle(page, "XY", [-30, -10], [-10, 10]);
  await extrudeRectangle(page, "XY", [10, -10], [30, 10]);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [-5, 20], [5, 20]);
  let state = await inspect(page);
  const original = state.document;
  assert.equal(original.bodies.length, 2);
  assert.equal(original.sketches.length, 3);
  await page.keyboard.press("Meta+a");
  state = await inspect(page);
  assert.deepEqual(
    state.selectionTargets,
    original.sketches[2].curves.map((curve) => ({ kind: "curve", curve: curve.id })),
  );
  assert.equal(state.activeSketch, original.sketches[2].id);
  await chooseTool(page, "select all", "select-all-entities");
  assert.deepEqual((await inspect(page)).selectionTargets, state.selectionTargets);

  await page.keyboard.press("Meta+Shift+a");
  const selection = async () => (await inspect(page)).modelingSelection;
  const bodies = original.bodies.map((body) => ({ kind: "body", body: body.id }));
  const sketches = original.sketches.map((sketch) => ({ kind: "sketch", sketch: sketch.id }));
  assert.deepEqual(await selection(), bodies);
  assert.equal((await inspect(page)).activeSketch, null);
  const button = (label) => page.getByRole("button", { name: label, exact: true });
  for (const label of ["Sketch 1", "Sketch 2"]) {
    if (await button(`Show ${label}`).count()) await button(`Show ${label}`).click();
    assert.equal(await button(`Hide ${label}`).count(), 1);
  }
  await page.keyboard.press("Meta+Alt+a");
  assert.deepEqual(await selection(), sketches);
  await page.keyboard.press("Meta+a");
  assert.deepEqual(await selection(), [...bodies, ...sketches]);
  await page.keyboard.press("Control+Shift+a");
  assert.deepEqual(await selection(), bodies);
  await page.keyboard.press("Control+Alt+a");
  assert.deepEqual(await selection(), sketches);
  await page.keyboard.press("Control+a");
  assert.deepEqual(await selection(), [...bodies, ...sketches]);

  await bulkEditingRoute(page, original);
  await visibilityRoute(page, original, bodies, sketches);
  console.log(
    `${name}: visible selection shortcuts, menu, hiding/isolation, text focus and Delete/Undo passed`,
  );
}

async function bulkEditingRoute(page, original) {
  await page.keyboard.press("Meta+Shift+a");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  const moved = (await inspect(page)).document;
  moved.bodies.forEach((body, index) => {
    close(body.center[0], original.bodies[index].center[0] + 3);
    close(body.volume, original.bodies[index].volume);
  });
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, moved);
  await chooseTool(page, "undo", "undo");
  await page.getByRole("button", { name: "Select Sketch 3", exact: true }).click();
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).activeSketch, original.sketches[2].id);
  await page.keyboard.press("Meta+a");
  await chooseTool(page, "clear sketch", "clear-sketch");
  assert.equal((await inspect(page)).document.sketches[2].curves.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "return to modeling", "modeling");
}

async function visibilityRoute(page, original, bodies, sketches) {
  const selection = async () => (await inspect(page)).modelingSelection;
  const button = (label) => page.getByRole("button", { name: label, exact: true });
  await button("Hide Body 1").click();
  await button("Hide Sketch 2").click();
  const visible = [bodies[1], sketches[0], sketches[2]];
  await page.keyboard.press("Meta+a");
  assert.deepEqual(await selection(), visible);
  for (const [query, id, expected] of [
    ["select all visible entities", "select-all-entities", visible],
    ["select all bodies", "select-all-bodies", [bodies[1]]],
    ["select all sketches", "select-all-sketches", [sketches[0], sketches[2]]],
  ]) {
    await chooseTool(page, query, id);
    assert.deepEqual(await selection(), expected);
  }
  await chooseTool(page, "isolate selection", "isolate");
  await page.keyboard.press("Meta+a");
  assert.deepEqual(await selection(), [sketches[0], sketches[2]]);
  await page.keyboard.press("Meta+Shift+a");
  assert.deepEqual(await selection(), []);
  await chooseTool(page, "exit isolation", "end-isolation");
  await chooseTool(page, "hide bodies", "hide-bodies");
  await page.keyboard.press("Meta+a");
  assert.deepEqual(await selection(), [sketches[0], sketches[2]]);
  await page.keyboard.press("Meta+Shift+a");
  assert.deepEqual(await selection(), []);

  await page.keyboard.press("Meta+f");
  const search = page.getByRole("combobox", { name: "Find a tool" });
  await search.fill("select all visible sketches");
  await page.keyboard.press("Meta+a");
  assert.equal(await search.evaluate((input) => input.selectionEnd - input.selectionStart), 27);
  assert.deepEqual(await selection(), []);
  await page.keyboard.press("Escape");
  await chooseTool(page, "show bodies", "show-bodies");
  await page.keyboard.press("Meta+Shift+a");
  assert.deepEqual(await selection(), [bodies[1]]);
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}

await withUiRuntimes(run);
