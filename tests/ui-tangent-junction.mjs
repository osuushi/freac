import assert from "node:assert/strict";
import { startArc } from "./ui-arc-links.mjs";
import { click, close, drag, inspect, inspectPointChoices, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const data = async (page) => (await inspect(page)).document.sketches[0];
function onArc(arc, fraction) {
  const dx = arc.b.x - arc.a.x;
  const dy = arc.b.y - arc.a.y;
  const factor = (1 - arc.bulge ** 2) / (4 * arc.bulge);
  const cx = (arc.a.x + arc.b.x) / 2 - dy * factor;
  const cy = (arc.a.y + arc.b.y) / 2 + dx * factor;
  const angle = Math.atan2(arc.a.y - cy, arc.a.x - cx) + 4 * Math.atan(arc.bulge) * fraction;
  const radius = Math.hypot(arc.a.x - cx, arc.a.y - cy);
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}
export async function tangentJunctionRoute(page, name) {
  await startArc(page, 4);
  await page.keyboard.press("l");
  await drag(page, [4, 0], [8, 3], ["Shift"]); // Exercise explicit Fuse.
  await page.keyboard.press("v");
  await click(page, 4, 0);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("Escape");
  await click(page, 20, 15);
  await click(page, 7, 2.25);
  await page.keyboard.down("Shift");
  await click(page, -3, Math.sqrt(7));
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 2);
  const before = await data(page);
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  let sketch = await data(page);
  assert.deepEqual(sketch.curves[0], before.curves[0]);
  const lineLength = Math.hypot(
    before.curves[1].b.x - before.curves[1].a.x,
    before.curves[1].b.y - before.curves[1].a.y,
  );
  pointEquals(sketch.curves[1].a, [4, 0]);
  pointEquals(sketch.curves[1].b, [4, lineLength]);
  assert.equal(sketch.constraints.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), before);
  await chooseTool(page, "redo", "redo");
  await inspect(page);
  await click(page, 20, 15);
  await click(page, -3, Math.sqrt(7));
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  await inspect(page);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [-4, 0]);
  pointEquals(sketch.curves[0].b, [4, 0]);
  pointEquals(sketch.curves[1].a, [4, 0]);
  pointEquals(sketch.curves[1].b, [4 - (3 * lineLength) / 5, (4 * lineLength) / 5]);
  close(Math.hypot(sketch.curves[1].b.x - 4, sketch.curves[1].b.y), lineLength);
  const beforeDrag = sketch;
  await click(page, 20, 15);
  await click(page, 4, 0);
  await drag(page, [4, 0], [4, 2], ["Shift"]);
  sketch = await data(page);
  assert.ok(Math.hypot(sketch.curves[0].b.x - 4, sketch.curves[0].b.y) > 0.1);
  pointEquals(sketch.curves[1].a, [sketch.curves[0].b.x, sketch.curves[0].b.y]);
  const arc = sketch.curves[0];
  close(
    (Math.hypot(arc.b.x - arc.a.x, arc.b.y - arc.a.y) * (1 + arc.bulge ** 2)) /
      (4 * Math.abs(arc.bulge)),
    5,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), beforeDrag);
  await click(page, -3, 1);
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-joined-tangent.png` });
  await page.getByRole("button", { name: "Remove Tangent constraint", exact: true }).click();
  await inspect(page);
  await click(page, 4, 0);
  await inspectPointChoices(page, 4, 0);
  assert.equal(await page.getByRole("button", { name: "Point 1", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  await inspect(page);
  await inspectPointChoices(page, 4, 0);
  await page.getByRole("button", { name: "Point 2", exact: true }).click();
  await page.keyboard.press("Escape");
  await drag(page, [4, 0], [6, -2], ["Shift"]);
  sketch = await data(page);
  pointEquals(sketch.curves[1].a, [6, -2]);
  pointEquals(sketch.curves[0].b, [4, 0]);
  await joinedArcs(page);
  console.log(
    `${name}: fused endpoint Tangent, locked arc radius with peer rotation, Undo and detach passed`,
  );
}

async function joinedArcs(page) {
  await startArc(page, 4);
  await page.keyboard.press("l");
  await drag(page, [4, 0], [8, 3], ["Shift"]); // Exercise explicit Fuse.
  await page.keyboard.press("v");
  const guide = page.locator(".bow-handle").nth(1);
  await guide.waitFor({ state: "visible" });
  const bow = await guide.boundingBox();
  await page.mouse.click(bow.x + bow.width / 2, bow.y + bow.height / 2);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("v");
  await click(page, 4, 0);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("Escape");
  await click(page, 20, 15);
  await click(page, ...onArc((await data(page)).curves[1], 0.3));
  await page.keyboard.down("Shift");
  await click(page, -3, Math.sqrt(7));
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 2);
  const original = await data(page);
  await page.getByRole("button", { name: "Constrain tangent", exact: true }).click();
  let sketch = await data(page);
  assert.equal(sketch.constraints.length, 2);
  assert.deepEqual(sketch.curves[0], original.curves[0]);
  pointEquals(sketch.curves[1].a, [4, 0]);
  close(sketch.curves[1].bulge, original.curves[1].bulge);
  await click(page, 20, 15);
  await click(page, -3, Math.sqrt(7));
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  const peer = sketch.curves[1];
  close(
    (Math.hypot(peer.b.x - peer.a.x, peer.b.y - peer.a.y) * (1 + peer.bulge ** 2)) /
      (4 * Math.abs(peer.bulge)),
    3,
  );
  close(peer.bulge, original.curves[1].bulge);
  pointEquals(peer.a, [4, 0]);
}
