import assert from "node:assert/strict";
import { pixels } from "./ui-fill.mjs";
import { click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function data(page) {
  return (await inspect(page)).document.sketches[0];
}
async function field(page, name, value) {
  await page.getByRole("textbox", { name, exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
async function addSelection(page, x, y) {
  await page.keyboard.down("Shift");
  await click(page, x, y);
  await page.keyboard.up("Shift");
}
async function action(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await inspect(page);
}
const length = (c) => Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
async function axisRoute(page, name) {
  await reset(page);
  await action(page, "Sketch on XY");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [8, 6]);
  await action(page, "Constrain horizontal");
  let line = (await data(page)).curves[0];
  pointEquals(line.a, [0, 0]);
  pointEquals(line.b, [10, 0]);
  await page.keyboard.press("v");
  await drag(page, [10, 0], [14, 4]);
  line = (await data(page)).curves[0];
  pointEquals(line.a, [0, 0]);
  pointEquals(line.b, [14, 0]);
  await field(page, "Angle", 30);
  line = (await data(page)).curves[0];
  pointEquals(line.b, [14, 0]);
  await action(page, "Remove Horizontal constraint");
  await action(page, "Constrain vertical");
  line = (await data(page)).curves[0];
  close(line.b.x, 0);
  close(Math.abs(line.b.y), 14);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 7, 0);
  await action(page, "Constrain horizontal");
  await page.screenshot({ path: `.cache/sketch-review/${name}-line-constraints.png` });
}
async function pairRoute(page, name) {
  await reset(page);
  await action(page, "Sketch on XY");
  // Existing reference first in storage; newly drawn subject is first in selection.
  await page.keyboard.press("l");
  await drag(page, [-10, 10], [-2, 16]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [6, 0]);
  await addSelection(page, -7, 12.25);
  const reference = (await data(page)).curves[0];
  await action(page, "Constrain parallel");
  let curves = (await data(page)).curves;
  assert.deepEqual(curves[0], reference, "Second selected reference stays fixed");
  pointEquals(curves[1].a, [0, 0]);
  pointEquals(curves[1].b, [4.8, 3.6]);
  assert.equal(await page.locator(".constraint-icons").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Remove Parallel constraint", exact: true }).isVisible(),
    true,
  );
  await action(page, "Constrain equal length");
  curves = (await data(page)).curves;
  assert.deepEqual(curves[0], reference);
  close(length(curves[1]), 10);
  const joined = (await inspect(page)).document;
  await click(page, 25, -10);
  await click(page, 2, 1.5);
  await page.getByRole("button", { name: "Remove Parallel constraint", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-constraint-participants.png` });
  // Diagonal strokes can fall between pixel centers. Sample their immediate
  // neighborhood and require a clearly amber stroke pixel for each participant.
  for (const [x, y] of [
    [-9.2, 10.6],
    [6, 4.5],
  ]) {
    const samples = [-0.08, 0, 0.08].flatMap((dx) =>
      [-0.08, 0, 0.08].map((dy) => [x + dx, y + dy]),
    );
    const colors = await pixels(page, samples, false);
    assert.ok(
      colors.some((color) => color[0] > color[2] + 35),
      `${JSON.stringify(colors)} participant must highlight`,
    );
  }
  assert.equal(await page.locator(".constraint-icons").count(), 0);
  await action(page, "Remove Parallel constraint");
  assert.equal(
    (await data(page)).constraints.some((c) => c.kind === "parallel"),
    false,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, joined);
  await click(page, 25, -10);
  await click(page, 4, 3);
  await field(page, "Length", 15);
  curves = (await data(page)).curves;
  for (const c of curves) close(length(c), 15);
  await click(page, 25, -10);
  const other = curves[0];
  await click(page, (other.a.x + other.b.x) / 2, (other.a.y + other.b.y) / 2);
  await field(page, "Length", 12);
  curves = (await data(page)).curves;
  for (const c of curves) close(length(c), 12);
  const saved = (await inspect(page)).document;
  await chooseTool(page, "delete", "delete");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, saved);
  await page.reload();
  assert.deepEqual((await inspect(page)).document, saved);
}
export async function relationRoute(page, name) {
  await axisRoute(page, name);
  await pairRoute(page, name);
  console.log(
    `${name}: axis application/projected drag, numeric conflict, first-subject parallel/equal, bidirectional edits and Undo passed`,
  );
}
