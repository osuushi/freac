import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function makeBox(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const inside = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(inside.x, inside.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  return (await inspect(page)).document;
}

async function supports(page, reverse) {
  for (const [i, sign] of (reverse ? [-1, 1] : [1, -1]).entries()) {
    await orient(page, [0, -1, sign]);
    await worldClick(page, [0, 0, sign === 1 ? 10 : 0], i !== 0);
  }
  const state = await inspect(page);
  assert.equal(state.modelingSelection.length, 2);
  assert.ok(state.modelingSelection.every((target) => target.kind === "face"));
}

await withUiRuntimes(async (page, name) => {
  for (const reverse of [false, true])
    for (const distance of [2, -2]) {
      const before = await makeBox(page);
      await supports(page, reverse);
      await chooseTool(page, "extrude", "extrude");
      await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Extrusion distance", exact: true })
        .fill(String(distance));
      await page.getByRole("button", { name: "New body", exact: true }).click();
      const candidate = (await inspect(page)).preview;
      const created = candidate.bodies.filter((body) => body.id !== before.bodies[0].id);
      assert.equal(created.length, 2);
      const centers = created.map((body) => body.center[2]).sort((a, b) => a - b);
      const delta = ((reverse ? -1 : 1) * distance) / 2;
      close(centers[0], delta);
      close(centers[1], 10 + delta);
      assert.ok(created.every((body) => Math.abs(body.volume - 800) < 1e-6));
      await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
      assert.deepEqual((await inspect(page)).document, candidate);
      await chooseTool(page, "undo", "undo");
      assert.deepEqual((await inspect(page)).document, before);
    }
  console.log(
    `${name}: opposite face supports, both selection orders and signed distances retain one Undo`,
  );
});
