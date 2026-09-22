import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function bodyMultiselectRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await page.keyboard.press("r");
  const points = [];
  for (const x of [-18, 12]) {
    await drag(page, [x, -8], [x + 12, 8]);
    points.push(await at(page, x + 3, 3));
  }
  await chooseTool(page, "return to modeling", "modeling");
  for (const p of points) {
    await page.mouse.click(p.x, p.y);
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  await page.keyboard.press("Escape");
  const original = (await inspect(page)).document;
  const bodies = original.bodies.map((b) => ({ kind: "body", body: b.id }));
  assert.equal(bodies.length, 2);
  async function pick(index, modifiers, expected) {
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.dblclick(points[index].x, points[index].y);
    for (const key of [...modifiers].reverse()) await page.keyboard.up(key);
    const state = await inspect(page);
    assert.deepEqual(state.modelingSelection, expected, modifiers.join("+"));
    assert.deepEqual(state.document, original);
    assert.equal(state.activePlane, null);
    assert.equal(state.preview, null);
  }
  await pick(0, [], [bodies[0]]);
  await pick(1, ["Shift"], bodies);
  await pick(0, ["Shift"], bodies);
  await pick(0, ["Meta"], [bodies[1]]);
  await pick(0, ["Meta"], [bodies[1], bodies[0]]);
  await pick(1, ["Shift", "Meta"], [bodies[0]]);
  // macOS reserves Control-click for the native context menu.
  if (process.platform !== "darwin") {
    await pick(1, ["Control"], bodies);
    await pick(0, ["Control"], [bodies[1]]);
  }
  await pick(0, [], [bodies[0]]);
  await page.mouse.click(points[1].x, points[1].y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  console.log(name, "modified whole-body double-click add/toggle/order passed");
}
