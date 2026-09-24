import assert from "node:assert/strict";
import {
  click,
  close,
  drag,
  inspect,
  inspectPointChoices,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const chooser = (page) => page.getByRole("group", { name: "Choose coincident points" });
const choice = (page, n) => chooser(page).getByRole("button", { name: `Point ${n}`, exact: true });
const data = async (page) => (await inspect(page)).document.sketches[0];
export async function pointLinkRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const end of [
    [10, 0],
    [0, 10],
    [-10, 0],
  ]) {
    await page.keyboard.press("l");
    await drag(page, [0, 0], end, ["Shift"]); // Explicit Fuse is tested below.
  }
  await page.keyboard.press("v");
  await click(page, 0, 0);
  assert.equal((await data(page)).constraints.length, 0, "Selection adds no links");
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 2);
  assert.equal(await chooser(page).locator("button[data-point-key]").count(), 0);
  await inspectPointChoices(page, 0, 0);
  assert.equal(await chooser(page).locator("button[data-point-key]").count(), 1);
  assert.equal(await choice(page, 1).locator("polyline").count(), 3);
  await choice(page, 1).click();
  await page.keyboard.press("Escape");
  await drag(page, [0, 0], [2, 4]);
  for (const curve of (await data(page)).curves) pointEquals(curve.a, [2, 4]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 0, 0);
  await inspectPointChoices(page, 0, 0);
  await choice(page, 1).click();
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 0, "Unfuse splits the selected component");
  await choice(page, 1).click();
  await page.keyboard.press("Escape");
  await drag(page, [0, 0], [2, 4]);
  const curves = (await data(page)).curves;
  pointEquals(curves[0].a, [2, 4]);
  pointEquals(curves[1].a, [0, 0]);
  pointEquals(curves[2].a, [0, 0]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  assert.equal((await data(page)).constraints.length, 2);
  await click(page, 0, 0);
  await inspectPointChoices(page, 0, 0);
  await choice(page, 1).click();
  await page.screenshot({ path: `.cache/sketch-review/${name}-point-links.png` });
  console.log(`${name}: explicit line-point Fuse, grouped drag, Unfuse and Undo passed`);
}

export async function circleLinkRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [4, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  assert.equal((await data(page)).constraints.length, 1);
  await inspectPointChoices(page, 0, 0);
  await choice(page, 1).click();
  await page.keyboard.press("Escape");
  await drag(page, [0, 0], [2, 4]);
  let curves = (await data(page)).curves;
  pointEquals(curves[0].center, [2, 4]);
  pointEquals(curves[1].a, [2, 4]);
  assert.equal(curves[0].radius, 4);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 0, 0);
  await inspectPointChoices(page, 0, 0);
  await choice(page, 1).click();
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  await inspect(page);
  await choice(page, 1).click();
  await page.keyboard.press("Escape");
  await drag(page, [0, 0], [2, 4]);
  curves = (await data(page)).curves;
  pointEquals(curves[0].center, [2, 4]);
  pointEquals(curves[1].a, [0, 0]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-circle-links.png` });
  console.log(
    `${name}: circle-center Fuse, narrowed linked movement, Unfuse and independent movement passed`,
  );
}

export async function pointTangentRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-10, 0], [0, 0], ["Shift"]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 4], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  assert.equal((await inspect(page)).pointChoice.length, 2);
  const tangent = page.getByRole("button", { name: "Constrain tangent", exact: true });
  await tangent.click();
  const sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.constraints.filter((constraint) => constraint.kind === "tangent").length, 1);
  assert.equal(
    sketch.constraints.filter((constraint) => constraint.kind === "coincident").length,
    0,
  );
  const [first, second] = sketch.curves;
  assert.equal(first.kind, "segment");
  assert.equal(second.kind, "segment");
  if (first.kind !== "segment" || second.kind !== "segment") return;
  const firstDirection = { x: first.a.x - first.b.x, y: first.a.y - first.b.y };
  const secondDirection = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
  close(firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x, 0);
  assert.ok(firstDirection.x * secondDirection.x + firstDirection.y * secondDirection.y < 0);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (const end of [
    [10, 0],
    [0, 10],
    [-10, 0],
  ]) {
    await page.keyboard.press("l");
    await drag(page, [0, 0], end, ["Shift"]);
  }
  await page.keyboard.press("v");
  await click(page, 0, 0);
  assert.equal(await tangent.count(), 0, "a degree-three junction offers no point Tangent");
  console.log(`${name}: unfused degree-two point Tangent and degree-three exclusion passed`);
}
