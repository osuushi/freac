import assert from "node:assert/strict";
import { click, drag, inspect, inspectPointChoices, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function moveCopiedJunction(page, source, result) {
  await page.keyboard.press("v");
  await click(page, -12, -7);
  assert.equal(
    await page.getByRole("button", { name: "Unfuse selected points", exact: true }).isEnabled(),
    true,
  );
  await inspectPointChoices(page, -12, -7);
  await page.getByRole("button", { name: "Point 1", exact: true }).click();
  await page.keyboard.press("Escape");
  await drag(page, [-12, -7], [-14, -9], ["Shift"]);
  const moved = (await inspect(page)).document.sketches[0];
  assert.deepEqual(moved.curves.slice(0, 4), source.curves);
  let count = 0;
  for (const old of result.curves.slice(4)) {
    const current = moved.curves.find((c) => c.id === old.id);
    for (const end of ["a", "b"]) {
      const corner = old[end].x === -12 && old[end].y === -7;
      pointEquals(current[end], corner ? [-14, -9] : [old[end].x, old[end].y]);
      if (corner) count++;
    }
  }
  assert.equal(count, 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.sketches[0], result);
}
