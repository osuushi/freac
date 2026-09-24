import assert from "node:assert/strict";
import {
  at,
  click,
  close,
  drag,
  inspect,
  inspectPointChoices,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const sketch = async (page) => (await inspect(page)).document.sketches[0];
const choose = (page, n) => page.getByRole("button", { name: `Point ${n}`, exact: true });
const radiusOf = (a) =>
  (Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) * (1 + a.bulge * a.bulge)) / (4 * Math.abs(a.bulge));
export async function startArc(page, height) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-4, 0], [4, 0]);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await inspect(page);
  const handle = page.locator(".bow-handle").nth(1);
  await handle.waitFor({ state: "visible" });
  const box = await handle.evaluate((element) => element.getBoundingClientRect().toJSON());
  const to = await at(page, 0, height);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}
export async function arcLinkRoute(page, name) {
  await startArc(page, 4);
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [-4, 0], [-10, 0], ["Shift"]); // Exercise explicit Fuse.
  await page.keyboard.press("v");
  await click(page, -4, 0);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  await inspectPointChoices(page, -4, 0);
  await choose(page, 1).click();
  await page.keyboard.press("Escape");
  await drag(page, [-4, 0], [-2, 2]);
  let curves = (await sketch(page)).curves;
  pointEquals(curves[0].a, [-2, 2]);
  pointEquals(curves[0].b, [4, 0]);
  pointEquals(curves[1].a, [-2, 2]);
  close(radiusOf(curves[0]), 4);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  pointEquals((await sketch(page)).curves[0].a, [-4, 0]);
  await startArc(page, 8);
  await page.keyboard.press("l");
  await drag(page, [0, 3], [10, 10]);
  await page.keyboard.press("v");
  await click(page, 0, 3);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  await inspectPointChoices(page, 0, 3);
  await choose(page, 1).click();
  await page.keyboard.press("Escape");
  // A center link must also follow fixed-endpoint radius edits through 180 degrees.
  await click(page, 0, 8); // Select the arc for radius editing after choosing the fused component.
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  await inspect(page);
  for (const value of [4, 6]) {
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
    await page.keyboard.press("Enter");
    const edited = (await sketch(page)).curves;
    close(radiusOf(edited[0]), value);
    pointEquals(edited[0].a, [-4, 0]);
    pointEquals(edited[0].b, [4, 0]);
    const centerY = value === 4 ? 0 : Math.sqrt(20);
    pointEquals(edited[1].a, [0, centerY]);
    if (value === 6) assert.ok(Math.abs(edited[0].bulge) > 1);
  }
  for (let i = 0; i < 3; i++) {
    await chooseTool(page, "undo", "undo");
    await inspect(page);
  }
  await click(page, 0, 3);
  await inspectPointChoices(page, 0, 3);
  await choose(page, 1).click();
  await page.keyboard.press("Escape");
  // The grouped selection uses a grid-snapped displacement; bypass geometry guides.
  await drag(page, [0, 3], [2, 7], ["Shift"]);
  curves = (await sketch(page)).curves;
  pointEquals(curves[0].a, [-2, 4]);
  pointEquals(curves[0].b, [6, 4]);
  pointEquals(curves[1].a, [2, 7]);
  close(curves[0].bulge, -2);
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await click(page, 0, 3);
  await inspectPointChoices(page, 0, 3);
  await choose(page, 1).click();
  await page.getByRole("button", { name: "Unfuse selected points", exact: true }).click();
  await inspect(page);
  await choose(page, 1).click();
  await page.keyboard.press("Escape");
  // Use the same grid-aligned displacement after detaching, bypassing geometry guides.
  await drag(page, [0, 3], [2, 7], ["Shift"]);
  curves = (await sketch(page)).curves;
  pointEquals(curves[1].a, [0, 3]);
  pointEquals(curves[0].a, [-2, 4]);
  assert.equal((await sketch(page)).constraints.length, 0);
  await page.screenshot({ path: `.cache/sketch-review/${name}-arc-links.png` });
  console.log(
    `${name}: arc endpoint Fuse with radius-locked drag, center Fuse/movement/Unfuse and Undo passed`,
  );
}
