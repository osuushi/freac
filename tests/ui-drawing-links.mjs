import assert from "node:assert/strict";
import {
  at,
  click,
  drag,
  inspect,
  inspectPointChoices,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function baseLine(page, end = [0, 0]) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-10, 0], end);
  return (await inspect(page)).document;
}
export async function drawingLinksRoute(page, name) {
  for (const reverse of [false, true]) {
    const before = await baseLine(page);
    await page.keyboard.press("l");
    await drag(
      page,
      ...(reverse
        ? [
            [5, 5],
            [0.2, 0.2],
          ]
        : [
            [0.2, 0.2],
            [5, 5],
          ]),
    );
    const linked = (await inspect(page)).document;
    const sketch = linked.sketches[0];
    assert.equal(sketch.constraints.length, 1);
    assert.equal(sketch.constraints[0].kind, "coincident");
    assert.deepEqual(sketch.curves[0], before.sketches[0].curves[0]);
    pointEquals(sketch.curves[1][reverse ? "b" : "a"], [0, 0]);
    await page.keyboard.press("v");
    await click(page, 0, 0);
    assert.equal(
      await page.getByRole("button", { name: "Unfuse selected points", exact: true }).isEnabled(),
      true,
    );
    await inspectPointChoices(page, 0, 0);
    await page.getByRole("button", { name: "Point 1", exact: true }).click();
    await page.keyboard.press("Escape");
    await drag(page, [0, 0], [0, 2], ["Shift"]);
    const moved = (await inspect(page)).document.sketches[0];
    pointEquals(moved.curves[0].a, [-10, 0]);
    pointEquals(moved.curves[0].b, [0, 2]);
    pointEquals(moved.curves[1][reverse ? "b" : "a"], [0, 2]);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, linked);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, linked);
  }
  await edgeContacts(page);
  await suppressedContacts(page);
  await otherPrimitives(page);
  await bypassPhases(page);
  console.log(
    `${name}: symmetric endpoint fusion and edge incidence, narrowed movement, Shift/ambiguity, primitives and Undo passed`,
  );
}
async function edgeContacts(page) {
  for (const reverse of [false, true]) {
    const before = await baseLine(page, [10, 0]);
    await page.keyboard.press("l");
    await drag(
      page,
      ...(reverse
        ? [
            [3, 5],
            [3, 0.2],
          ]
        : [
            [3, 0.2],
            [3, 5],
          ]),
    );
    const sketch = (await inspect(page)).document.sketches[0];
    assert.equal(sketch.constraints[0].kind, "point-on-edge");
    assert.equal(sketch.constraints[0].edge, before.sketches[0].curves[0].id);
    await page.keyboard.press("v");
    await click(page, 3, 0);
    await drag(page, [3, 0], [6, 0], ["Shift"]);
    const moved = (await inspect(page)).document.sketches[0];
    assert.deepEqual(moved.curves[0], before.sketches[0].curves[0]);
    pointEquals(moved.curves[1][reverse ? "b" : "a"], [6, 0]);
    await page.getByRole("button", { name: "Remove Coincident constraint", exact: true }).click();
    assert.equal((await inspect(page)).document.sketches[0].constraints.length, 0);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document.sketches[0], moved);
    await bowAttachedLine(page, moved);
  }
}
async function suppressedContacts(page) {
  for (const reverse of [false, true]) {
    await baseLine(page);
    await page.keyboard.press("l");
    await drag(
      page,
      ...(reverse
        ? [
            [5, 5],
            [0, 0],
          ]
        : [
            [0, 0],
            [5, 5],
          ]),
      ["Shift"],
    );
    assert.equal((await inspect(page)).document.sketches[0].constraints.length, 0);
    // Two overlapping endpoint identities stay ambiguous even though neither is fused.
    await page.keyboard.press("l");
    await drag(page, [0, 0], [0, -5]);
    assert.equal((await inspect(page)).document.sketches[0].constraints.length, 0);
  }
  await baseLine(page, [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, -10], [0, 10], ["Shift"]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [5, 5]);
  assert.equal((await inspect(page)).document.sketches[0].constraints.length, 0);
}
async function otherPrimitives(page) {
  await baseLine(page);
  await page.keyboard.press("r");
  await drag(page, [5, 5], [0, 0]);
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.constraints.filter((c) => c.kind === "coincident").length, 5);
  await baseLine(page);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [4, 0]);
  sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.constraints[0].a.end, "center");
  // Release away from a snap must not retain a relationship from an earlier preview.
  await baseLine(page);
  await page.keyboard.press("l");
  const a = await at(page, 5, 5),
    b = await at(page, 0, 0),
    c = await at(page, 5, -5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.move(c.x, c.y, { steps: 8 });
  await page.mouse.up();
  assert.equal((await inspect(page)).document.sketches[0].constraints.length, 0);
}

async function bowAttachedLine(page, before) {
  await click(page, 20, 15);
  const line = before.curves[1];
  await click(page, (line.a.x + line.b.x) / 2, (line.a.y + line.b.y) / 2);
  await page.locator(".bow-handle").first().waitFor();
  const handle = await page.locator(".bow-handle").first().boundingBox();
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("4");
  await page.keyboard.press("Enter");
  const result = (await inspect(page)).document.sketches[0];
  assert.equal(result.curves[1].kind, "arc", await page.getByRole("status").textContent());
  assert.deepEqual(result.curves[0], before.curves[0]);
  assert.deepEqual(result.constraints, before.constraints);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], before);
}

export async function bypassPhases(page) {
  for (const suppressStart of [true, false]) {
    await baseLine(page);
    await page.keyboard.press("l");
    await drag(page, [20, 0], [10, 0]);
    await page.keyboard.press("l");
    const a = await at(page, 0, 0),
      middle = await at(page, 5, 5),
      b = await at(page, 10, 0);
    if (suppressStart) await page.keyboard.down("Shift");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y, { steps: 8 });
    if (suppressStart) await page.keyboard.up("Shift");
    else await page.keyboard.down("Shift");
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const sketch = (await inspect(page)).document.sketches[0];
    assert.equal(sketch.constraints.length, 1);
    assert.equal(sketch.constraints[0].a.end, suppressStart ? "b" : "a");
  }
}
