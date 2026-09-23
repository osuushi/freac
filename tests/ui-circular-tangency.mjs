import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { at, click, close, drag, inspect, pointEquals, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
async function pair(page, reference) {
  const p = await at(page, ...reference);
  assert.equal(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("button,input"),
      p,
    ),
    false,
  );
  await page.keyboard.down("Shift");
  await click(page, ...reference);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 2);
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  await inspect(page);
}
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
async function circles(page, internal) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, internal ? [0, 0] : [10, 0], internal ? [8, 0] : [13, 0]);
  await page.keyboard.press("c");
  await drag(page, internal ? [4, 0] : [0, 0], internal ? [6, 0] : [2, 0]);
  await page.keyboard.press("v");
  const original = await data(page);
  await pair(page, internal ? [0, -8] : [10, -3]);
  let sketch = await data(page);
  assert.deepEqual(sketch.curves[0], original.curves[0]);
  pointEquals(sketch.curves[1].center, internal ? [6, 0] : [5, 0]);
  assert.equal(sketch.constraints[0].side, internal ? "b-contains-a" : "external");
  await click(page, 20, 15);
  await click(page, internal ? 4 : 3, 0);
  await radius(page, 3);
  sketch = await data(page);
  pointEquals(sketch.curves[0].center, internal ? [1, 0] : [11, 0]);
  close(sketch.curves[0].radius, internal ? 8 : 3);
  if (internal) {
    await radius(page, 9);
    assert.deepEqual(await data(page), sketch);
    await page.getByRole("status").filter({ hasText: "containing circle" }).waitFor();
    await page.keyboard.press("Escape");
    await click(page, 3, 0);
  }
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).click();
  assert.equal((await data(page)).constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), sketch);
}
async function arcCircle(page, name) {
  await startArc(page, 8);
  await page.keyboard.press("c");
  await drag(page, [12, 3], [14, 3]);
  await page.keyboard.press("v");
  await click(page, -5, 3);
  const before = await data(page);
  await pair(page, [12, 1]);
  let sketch = await data(page);
  assert.deepEqual(sketch.curves[1], before.curves[1]);
  pointEquals(sketch.curves[0].a, [1, 0]);
  pointEquals(sketch.curves[0].b, [9, 0]);
  await click(page, 20, 15);
  await click(page, 0, 3);
  await radius(page, 6);
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [1, 0]);
  pointEquals(sketch.curves[0].b, [9, 0]);
  close(Math.hypot(sketch.curves[1].center.x - 5, sketch.curves[1].center.y - Math.sqrt(20)), 8);
  close(sketch.curves[1].radius, 2);
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-circular-tangent.png` });
}
export async function circularTangencyRoute(page, name) {
  await circles(page, false);
  await circles(page, true);
  await arcCircle(page, name);
  await arcPair(page);
  console.log(
    `${name}: external/internal circle tangency, containment rejection, arc/circle and two-arc radius edits and Undo passed`,
  );
}

async function arcPair(page) {
  await startArc(page, 8);
  await page.keyboard.press("l");
  await drag(page, [10, 0], [14, 0]);
  const box = await page.locator(".bow-handle").nth(1).boundingBox();
  const to = await at(page, 12, 4);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  await page.keyboard.press("v");
  await click(page, -5, 3);
  const before = await data(page);
  await pair(page, [14.5, 1.5]);
  const linked = await data(page);
  assert.deepEqual(linked.curves[1], before.curves[1]);
  close(linked.curves[0].bulge, -2);
  assert.equal(linked.constraints[0].side, "external");
  const centerX = (linked.curves[0].a.x + linked.curves[0].b.x) / 2;
  await click(page, 20, 15);
  await click(page, centerX - 5, linked.curves[0].a.y + 3);
  await radius(page, 6);
  const result = await data(page);
  const peer = result.curves[1];
  close(peer.bulge, -2);
  close(Math.hypot(peer.b.x - peer.a.x, peer.b.y - peer.a.y), 4);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), linked);
}
