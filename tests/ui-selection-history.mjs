import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { at, click, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function history(page, redo = false) {
  await page.keyboard.press(redo ? "Meta+Shift+z" : "Meta+z");
  await settled(page);
}
const targets = async (page) => (await inspect(page)).selectionTargets;
export async function selectionHistoryRoute(page, name) {
  await drawLines(page);
  await click(page, -14, 0);
  const first = await targets(page);
  assert.equal(first.length, 1);
  await page.keyboard.down("Shift");
  await click(page, 12, 0);
  await page.keyboard.up("Shift");
  const both = await targets(page);
  assert.equal(both.length, 2);
  await click(page, 25, 20);
  assert.deepEqual(await targets(page), []);
  await history(page);
  assert.deepEqual(await targets(page), both, "Undo blank misclick restores ordered selection");
  await history(page);
  assert.deepEqual(await targets(page), first);
  await history(page, true);
  assert.deepEqual(await targets(page), both);
  await history(page, true);
  assert.deepEqual(await targets(page), []);
  await history(page);
  const original = (await inspect(page)).document;
  await traverseSuffix(page, original);
  await page.keyboard.press("Backspace");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await history(page);
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual(await targets(page), both, "Undo Delete restores the selection used by Delete");
  await history(page);
  assert.equal(
    (await inspect(page)).document.sketches[0].curves.length,
    1,
    "Next Undo skips evicted selections",
  );
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, original);
  await history(page, true);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await history(page);
  await click(page, 25, 20);
  await click(page, -20, 0);
  const point = await targets(page);
  assert.equal(point[0].kind, "endpoint");
  await click(page, 25, 20);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await targets(page), point, "Tool-menu Undo restores typed point selection");
  await chooseTool(page, "redo", "redo");
  assert.deepEqual(await targets(page), []);
  const p = await at(page, -14, 0);
  await page.mouse.dblclick(p.x, p.y);
  const double = await targets(page);
  await click(page, 25, 20);
  await history(page);
  assert.deepEqual(await targets(page), double);
  await history(page);
  await history(page, true);
  assert.deepEqual(
    await targets(page),
    double,
    "Double-click intermediates navigate without eviction",
  );
  const beforeMove = (await inspect(page)).document;
  await drag(page, [-14, 0], [-14, 5]);
  const moved = (await inspect(page)).document;
  assert.notDeepEqual(moved, beforeMove);
  await history(page);
  assert.deepEqual((await inspect(page)).document, beforeMove);
  assert.deepEqual(await targets(page), double, "Undo Move restores its input selection");
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, moved);
  await bodyHistory(page);
  console.log(
    `${name}: sketch/model selection suffix, Delete/Move history, points and double-click passed`,
  );
}

async function bodyHistory(page) {
  const { center } = await plate(page);
  const edges = (await inspect(page)).modelingSelection;
  const original = (await inspect(page)).document;
  center.x -= 60;
  center.y -= 60;
  await page.mouse.click(center.x, center.y);
  const face = (await inspect(page)).modelingSelection;
  assert.equal(face[0].kind, "face");
  await history(page);
  assert.deepEqual((await inspect(page)).modelingSelection, edges);
  await history(page, true);
  assert.deepEqual((await inspect(page)).modelingSelection, face);
  await page.mouse.dblclick(center.x, center.y);
  const whole = (await inspect(page)).modelingSelection;
  assert.equal(whole[0].kind, "body");
  await page.keyboard.down("Meta");
  await page.mouse.dblclick(center.x, center.y);
  await page.keyboard.up("Meta");
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await history(page);
  const intermediate = (await inspect(page)).modelingSelection;
  await history(page, true);
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await history(page);
  assert.deepEqual((await inspect(page)).modelingSelection, intermediate);
  await page.mouse.dblclick(center.x, center.y);
  assert.deepEqual((await inspect(page)).modelingSelection, whole);
  await page.keyboard.press("Backspace");
  assert.equal(((await inspect(page)).document.bodies ?? []).length, 0);
  await history(page);
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual((await inspect(page)).modelingSelection, whole);
  await page.reload();
  assert.deepEqual(
    (await inspect(page)).modelingSelection,
    whole,
    "Selection survives renderer reload",
  );
  await history(page);
  assert.equal(
    ((await inspect(page)).document.bodies ?? []).length,
    0,
    "Body selection steps evicted before Delete",
  );
  await history(page, true);
  await history(page, true);
  assert.equal(((await inspect(page)).document.bodies ?? []).length, 0);
}

async function traverseSuffix(page, original) {
  const path = [];
  for (let i = 0; i < 12; i++) {
    const state = await inspect(page);
    path.push({ document: state.document, selection: state.selectionTargets });
    await history(page);
    if (JSON.stringify((await inspect(page)).document) !== JSON.stringify(original)) break;
  }
  assert.notDeepEqual(
    (await inspect(page)).document,
    original,
    "Undo traverses the selection suffix into geometry",
  );
  for (const state of path.reverse()) {
    await history(page, true);
    assert.deepEqual((await inspect(page)).document, state.document);
    assert.deepEqual(
      await targets(page),
      state.selection,
      "Redo preserves every selection step across geometry navigation",
    );
  }
}

async function drawLines(page) {
  await reset(page);
  assert.deepEqual(
    await page.evaluate(() => window.freacHistory()),
    [],
    "New resets selection history",
  );
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-5, 0]);
  await page.keyboard.press("l");
  await drag(page, [5, 0], [20, 0]);
  await page.keyboard.press("Escape");
}
