import assert from "node:assert/strict";
import { pixels } from "./ui-fill.mjs";
import { at, click, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const menu = (page) => page.getByRole("group", { name: "Choose coincident points" });
const choice = (page, n) => menu(page).getByRole("button", { name: `Point ${n}`, exact: true });
const curves = async (page) => (await inspect(page)).document.sketches[0].curves;
async function rays(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  for (const end of [
    [12, 0],
    [0, 12],
    [-12, 0],
  ])
    await drag(page, [0, 0], end, ["Shift"]); // Keep chooser fixtures independent.
  await page.keyboard.press("v");
}
export async function pointChoiceRoute(page, name) {
  await rays(page);
  const before = (await inspect(page)).document;
  await click(page, 0, 0);
  await menu(page).waitFor();
  assert.equal(
    await menu(page)
      .getByRole("button", { name: /^Point [0-9]+$/ })
      .count(),
    3,
  );
  assert.equal((await inspect(page)).pointChoice.length, 3);
  await choice(page, 1).click();
  assert.equal((await inspect(page)).pointChoice.length, 1);
  assert.deepEqual(
    (await inspect(page)).document,
    before,
    "Choosing points does not change document",
  );
  await pointFeedback(page, name);
  await drag(page, [0, 0], [2, 2]);
  let edges = await curves(page);
  pointEquals(edges[0].a, [2, 2]);
  pointEquals(edges[1].a, [0, 0]);
  pointEquals(edges[2].a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal((await inspect(page)).pointChoice, null);
  // Shift without pointer movement reopens the junction chooser.
  const origin = await at(page, 0, 0);
  await page.mouse.move(origin.x, origin.y);
  await page.keyboard.down("Shift");
  await menu(page).waitFor();
  await page.keyboard.up("Shift");
  await choice(page, 1).click();
  await choice(page, 2).click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).pointChoice.length, 2);
  await choice(page, 2).click({ modifiers: ["Shift"] });
  assert.equal((await inspect(page)).pointChoice.length, 2);
  await choice(page, 2).click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).pointChoice.length, 1);
  await choice(page, 2).click({ modifiers: ["Meta"] });
  assert.equal((await inspect(page)).pointChoice.length, 2);
  await choice(page, 1).click();
  await choice(page, 2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Escape");
  assert.equal(await menu(page).isVisible(), false);
  await page.mouse.move(origin.x, origin.y);
  await page.keyboard.down("Shift");
  await menu(page).waitFor();
  await page.keyboard.up("Shift");
  assert.equal(await choice(page, 1).getAttribute("aria-pressed"), "true");
  assert.equal(await choice(page, 2).getAttribute("aria-pressed"), "true");
  assert.equal(await choice(page, 3).getAttribute("aria-pressed"), "false");
  await drag(page, [0, 0], [4, 4]); // Use an exact grid point, not the half-grid tie.
  edges = await curves(page);
  pointEquals(edges[0].a, [4, 4]);
  pointEquals(edges[1].a, [4, 4]);
  pointEquals(edges[2].a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  // With no explicit narrowing, immediate Select drag still moves all three.
  await drag(page, [0, 0], [2, -2]);
  for (const edge of await curves(page)) pointEquals(edge.a, [2, -2]);
  await centeredChoice(page);
  await curvedAndCornerChoices(page);
  console.log(
    `${name}: point diagrams, hover, Shift reopen/multiselection, narrowed/all-point drags, centers and Undo passed`,
  );
}
async function centeredChoice(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [5, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 10]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await menu(page).waitFor();
  await choice(page, 1).click();
  await drag(page, [0, 0], [-4, 0]);
  const shapes = await curves(page);
  pointEquals(shapes[0].center, [-4, 0]);
  pointEquals(shapes[1].a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  // Switching to drawing dismisses choice and permits drawing from shared points.
  await click(page, 0, 0);
  await menu(page).waitFor();
  await page.keyboard.press("l");
  assert.equal(await menu(page).isVisible(), false);
  await drag(page, [0, 0], [-10, 10]);
  assert.equal((await curves(page)).length, 3);
}

async function pointFeedback(page, name) {
  // Near the selected endpoint is bluer than the unselected far end.
  const samples = await pixels(page, [
    [1, 0],
    [9, 0],
  ]);
  assert.ok(
    samples[0][2] - samples[0][0] > samples[1][2] - samples[1][0] + 10,
    `Visible gradient: ${samples}`,
  );
  await choice(page, 2).hover();
  assert.equal(
    await page.getByRole("textbox", { name: "Length", exact: true }).count(),
    0,
    "Chooser is not covered by dimensions",
  );
  const hoverSamples = await pixels(
    page,
    [
      [0, 1],
      [0, 9],
    ],
    false,
  );
  assert.ok(
    hoverSamples[0][0] - hoverSamples[0][2] > hoverSamples[1][0] - hoverSamples[1][2] + 10,
    `Visible branch hover: ${hoverSamples}`,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-point-chooser.png` });
}

async function curvedAndCornerChoices(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-6, 0], [6, 0]);
  const handle = await page.locator(".bow-handle").nth(1).boundingBox(),
    target = await at(page, 0, 3);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [-6, 0], [-6, 10], ["Shift"]); // Independent arc/line point choices.
  await page.keyboard.press("v");
  await click(page, -6, 0);
  await menu(page).waitFor();
  await choice(page, 1).click();
  await drag(page, [-6, 0], [-8, -2]);
  let edges = await curves(page);
  assert.equal(edges[0].kind, "arc");
  pointEquals(edges[0].a, [-8, -2]);
  pointEquals(edges[1].a, [-6, 0]);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [10, 10]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [-10, 0]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await menu(page).waitFor();
  assert.equal(
    await choice(page, 2).locator("polyline").count(),
    2,
    "Rectangle corner diagram has two branches",
  );
  await choice(page, 2).click();
  await drag(page, [0, 0], [2, 2]);
  edges = await curves(page);
  pointEquals(edges[0].a, [2, 2]);
  pointEquals(edges[4].a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  edges = await curves(page);
  pointEquals(edges[0].a, [0, 0]);
  pointEquals(edges[4].a, [0, 0]);
}
