import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { at, click, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function center(locator) {
  const b = await locator.boundingBox();
  assert.ok(b);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function history(page, before, after) {
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
}
async function hold(page, target, dx = 100, dy = 0) {
  const p = await center(target);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 });
}
async function release(page) {
  await page.mouse.up();
  await page.keyboard.up("Alt");
  return inspect(page);
}
async function rectangle(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [0, 10]);
  await page.keyboard.press("v");
}
export async function optionMoveRoute(page, name) {
  await rectangle(page);
  await click(page, -15, -10);
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  const marker = page.locator('[data-move-marker="y"] > svg');
  await hold(page, marker, 0, -100);
  await page.keyboard.down("Alt");
  let state = await inspect(page);
  assert.equal(state.preview.sketches[0].curves.length, 5);
  assert.deepEqual(state.preview.sketches[0].curves.slice(0, 4), original.sketches[0].curves);
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).preview.sketches[0].curves.length, 4);
  await page.keyboard.down("Alt");
  state = await release(page);
  const partial = state.document;
  assert.equal(partial.sketches[0].curves.length, 5);
  assert.deepEqual(partial.sketches[0].curves.slice(0, 4), original.sketches[0].curves);
  assert.deepEqual(state.selectedCurves, [partial.sketches[0].curves[4].id]);
  await history(page, original, partial);
  const copied = partial.sketches[0].curves[4];
  await click(page, copied.a.x * 0.7 + copied.b.x * 0.3, copied.a.y * 0.7 + copied.b.y * 0.3);
  await page.keyboard.press("m");
  // The copied partial sketch curve remains independently movable.
  await hold(page, page.locator('[data-move-marker="x"] > svg'));
  await release(page);
  assert.deepEqual(
    (await inspect(page)).document.sketches[0].curves.slice(0, 4),
    original.sketches[0].curves,
  );
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, copied.a.x * 0.7 + copied.b.x * 0.3, copied.a.y * 0.7 + copied.b.y * 0.3);
  await page.keyboard.press("m");
  await page.keyboard.down("Alt");
  await hold(page, marker, 0, -60);
  await page.keyboard.press("Escape");
  await release(page);
  assert.deepEqual((await inspect(page)).document, partial);
  await rectangle(page);
  await click(page, -10, 0);
  await page.keyboard.press("m");
  const groupBefore = (await inspect(page)).document;
  await page.keyboard.down("Alt");
  await hold(page, page.locator('[data-move-marker="x"] > svg'), 150);
  state = await release(page);
  assert.equal(state.document.sketches[0].groups.length, 2);
  assert.equal(state.document.sketches[0].curves.length, 8);
  assert.deepEqual(state.document.sketches[0].curves.slice(0, 4), groupBefore.sketches[0].curves);
  await history(page, groupBefore, state.document);
  await numericSketch(page);
  await wholeSketch(page);
  await body(page);
  await archive(page, name);
  console.log(
    `${name}: Option-Move partial sketch, groups, whole sketch and exact body copies; live modifier, cancellation, history and copy movement passed`,
  );
}
async function archive(page, name) {
  const saved = (await inspect(page)).document;
  const path = resolve(`.cache/sketch-review/${name}-option-move.freac`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  const reopened = (await inspect(page)).document;
  assert.deepEqual(reopened.sketches, saved.sketches);
  assert.equal(reopened.bodies.length, saved.bodies.length);
  for (const [index, body] of reopened.bodies.entries()) {
    const original = saved.bodies[index];
    // OCCT reconstructs axis frames on read and can change the sign of zero.
    const brepText = (hex) =>
      Buffer.from(hex, "hex")
        .toString()
        .replace(/(?<!\S)-0(?=\s)/g, "0");
    assert.ok(
      brepText(body.brep) === brepText(original.brep),
      "Exact BRep survives reopening modulo signed zero",
    );
    assert.equal(body.id, original.id);
    assert.deepEqual(
      body.faces.map((f) => f.id),
      original.faces.map((f) => f.id),
    );
    assert.deepEqual(
      body.edges.map((e) => e.id),
      original.edges.map((e) => e.id),
    );
    close(body.volume, original.volume);
    for (const [i, coordinate] of body.center.entries()) close(coordinate, original.center[i]);
  }
}
async function numericSketch(page) {
  await rectangle(page);
  await click(page, -15, -10);
  await page.keyboard.press("m");
  const before = (await inspect(page)).document;
  const tip = await center(page.locator('[data-move-marker="x"] > svg'));
  await page.keyboard.down("Alt");
  await page.mouse.click(tip.x, tip.y);
  await page.keyboard.up("Alt");
  await page.getByRole("textbox", { name: "Move X", exact: true }).fill("30");
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  assert.equal(after.sketches[0].curves.length, 5);
  assert.deepEqual(after.sketches[0].curves.slice(0, 4), before.sketches[0].curves);
  assert.equal(after.sketches[0].curves[4].a.x, before.sketches[0].curves[0].a.x + 30);
  await history(page, before, after);
}
async function wholeSketch(page) {
  await rectangle(page);
  const inside = await at(page, -10, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(inside.x, inside.y);
  await chooseTool(page, "move sketch", "move-sketch");
  const before = (await inspect(page)).document;
  await hold(page, page.getByRole("button", { name: "Move sketch X", exact: true }));
  await page.keyboard.down("Alt");
  assert.equal((await inspect(page)).preview.sketches.length, 2);
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).preview.sketches.length, 1);
  await page.keyboard.down("Alt");
  const state = await release(page);
  assert.equal(state.document.sketches.length, 2);
  assert.deepEqual(state.document.sketches[0], before.sketches[0]);
  await history(page, before, state.document);
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  await chooseTool(page, "edit sketch", "edit-sketch");
  assert.equal((await inspect(page)).activeSketch, state.document.sketches[1].id);
}
async function body(page) {
  await rectangle(page);
  const inside = await at(page, -10, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(inside.x, inside.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  const original = (await inspect(page)).document;
  await page.mouse.click(inside.x, inside.y);
  await page.keyboard.press("m");
  await page.keyboard.down("Alt");
  await hold(page, page.getByRole("button", { name: "Move faces X", exact: true }), 30);
  assert.equal((await inspect(page)).preview.bodies.length, 1);
  await page.keyboard.press("Escape");
  await release(page);
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  const before = (await inspect(page)).document;
  await hold(page, page.getByRole("button", { name: "Move body X", exact: true }), 150);
  await page.keyboard.down("Alt");
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).preview.bodies.length, 1);
  await page.keyboard.down("Alt");
  let state = await release(page);
  assert.equal(state.document.bodies.length, 2);
  assert.deepEqual(state.document.bodies[0], before.bodies[0]);
  assert.equal(state.document.bodies[1].volume, before.bodies[0].volume);
  const after = state.document;
  await history(page, before, after);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await page.keyboard.press("m");
  await hold(page, page.getByRole("button", { name: "Move body Y", exact: true }), 0, -60);
  state = await release(page);
  assert.deepEqual(state.document.bodies[0], before.bodies[0]);
  assert.notDeepEqual(state.document.bodies[1].center, after.bodies[1].center);
  const moved = state.document;
  await page.keyboard.down("Alt");
  await hold(page, page.getByRole("button", { name: "Move body X", exact: true }));
  await page.keyboard.press("Escape");
  await release(page);
  assert.deepEqual((await inspect(page)).document, moved);
  await page
    .getByRole("button", { name: "Rotate body Z", exact: true })
    .click({ modifiers: ["Alt"] });
  await page.getByRole("textbox", { name: "Body rotation Z", exact: true }).fill("90");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 3);
  assert.deepEqual(state.document.bodies.slice(0, 2), moved.bodies);
  await history(page, moved, state.document);
}
