import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
export async function trimArcRoute(page, name) {
  await startArc(page, 8);
  await page.keyboard.press("l");
  await drag(page, [-10, 6], [10, 6]);
  const original = await data(page);
  await page.keyboard.press("t");
  await click(page, 0, 8);
  let sketch = await data(page);
  const arcs = sketch.curves.filter((c) => c.kind === "arc");
  assert.equal(arcs.length, 2);
  assert.equal(sketch.curves.length, 3);
  pointEquals(arcs[0].a, [-4, 0]);
  close(arcs[0].b.y, 6);
  close(arcs[1].a.y, 6);
  pointEquals(arcs[1].b, [4, 0]);
  await page.keyboard.press("v");
  await click(page, -Math.sqrt(21), 1);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("6");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  const edited = sketch.curves[0];
  const r =
    (Math.hypot(edited.b.x - edited.a.x, edited.b.y - edited.a.y) * (1 + edited.bulge ** 2)) /
    (4 * Math.abs(edited.bulge));
  close(r, 6);
  assert.deepEqual(sketch.curves[1], arcs[1]);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), original);
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("l");
    await drag(page, [-10, 0], [10, 0]);
  }
  const both = await data(page);
  await page.keyboard.press("t");
  await click(page, 0, 0);
  assert.equal((await data(page)).curves.length, 0);
  assert.equal(await page.locator(".trim-span").getAttribute("points"), "");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), both);
  console.log(
    `${name}: bounded major-arc fragment trim/edit/Undo and complete overlapping-edge removal passed`,
  );
}
