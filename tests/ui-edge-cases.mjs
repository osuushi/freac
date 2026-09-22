import assert from "node:assert/strict";
import {
  at,
  click,
  close,
  corners,
  drag,
  inspect,
  pointEquals,
  reset,
  settled,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function controlsAndRejection(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [0, 0], [20, 10]);
  await chooseTool(page, "select", "select");
  await chooseTool(page, "line", "line");
  await drag(page, [-20, 0], [-10, 0]);
  await page.keyboard.press("v");
  await click(page, 10, 5);
  const accepted = JSON.stringify((await inspect(page)).document);
  await click(page, 20, 5);
  await drag(page, [20, 5], [0, 5]);
  assert.equal(
    JSON.stringify((await inspect(page)).document),
    accepted,
    "Invalid final target must not commit the last valid preview",
  );
  await page.getByRole("status").filter({ hasText: "non-zero" }).waitFor();
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("25");
  await chooseTool(page, "undo", "undo");
  assert.equal(
    (await inspect(page)).document.sketches[0].curves.length,
    4,
    "Undo discards a field draft instead of committing it",
  );
  close((await corners(page))[1].x, 20);
  await chooseTool(page, "redo", "redo");
  await click(page, 10, 5);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("30");
  await click(page, 35, 25);
  const p = await corners(page);
  close(p[1].x - p[0].x, 30, "Numeric blur commits once");
  await page.keyboard.press("Control+z");
  assert.equal(JSON.stringify((await inspect(page)).document), accepted);
}
async function heldLineAndFocus(page) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("l");
  const a = await at(page, -10, -5),
    b = await at(page, 0, -5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.getByRole("textbox", { name: "Length", exact: true }).waitFor();
  await page.keyboard.type("20");
  await page.keyboard.press("Tab");
  await settled(page);
  await page.keyboard.type("45");
  await page.keyboard.press("Enter");
  await page.mouse.up();
  const line = (await inspect(page)).document.sketches[0].curves[0];
  pointEquals(line.b, [-10 + 20 / Math.sqrt(2), -5 + 20 / Math.sqrt(2)]);
  await page.keyboard.press("Escape");
  await click(page, (line.a.x + line.b.x) / 2, (line.a.y + line.b.y) / 2);
  const accepted = JSON.stringify((await inspect(page)).document);
  await page.getByRole("textbox", { name: "Length", exact: true }).focus();
  await page.keyboard.press("Tab");
  await settled(page);
  await page.keyboard.press("Escape");
  assert.equal(
    JSON.stringify((await inspect(page)).document),
    accepted,
    "Rounded display text must not change geometry on focus/Tab",
  );
}
async function sharedPlanes(page, name) {
  await reset(page);
  for (const plane of ["XY", "XZ", "YZ"]) {
    await page.getByRole("button", { name: `Sketch on ${plane}` }).click();
    await page.keyboard.press("r");
    await drag(page, [3, 3], [13, 9]);
    await page.mouse.move(1050, 650);
    await page.keyboard.down("Alt");
    await page.mouse.wheel(-40, 25);
    await page.keyboard.up("Alt");
    await page.waitForFunction(() => window.freacInspect().activePlane === null);
  }
  const doc = (await inspect(page)).document;
  assert.equal(doc.sketches.length, 3);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 2);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, doc);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-three-planes.png` });
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("v");
  await page.mouse.move(1000, 600);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(1070, 570, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 25);
  await page.keyboard.up("Control");
  await click(page, 8, 6);
  await click(page, 3, 6);
  await drag(page, [3, 6], [1, 6]);
  const changed = (await inspect(page)).document;
  assert.deepEqual(
    changed.sketches.slice(1),
    doc.sketches.slice(1),
    "Editing XY leaves XZ and YZ unchanged",
  );
  pointEquals(changed.sketches[0].curves[0].a, [1, 3]);
}
export async function edgeCases(page, name) {
  await controlsAndRejection(page);
  await heldLineAndFocus(page);
  await sharedPlanes(page, name);
  console.log(
    `${name}: tool buttons, invalid drag rejection, field blur/Undo, held-line dimensions, shared planes and pan/zoom passed`,
  );
}
