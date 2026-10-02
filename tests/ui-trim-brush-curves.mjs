import assert from "node:assert/strict";
import { at, click, close, drag, inspect, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { diameter, highlights, lines } from "./ui-trim-brush-helpers.mjs";

export async function trimBrushCurveRoute(page, name) {
  await lines(page, [
    [
      [-15, -3],
      [-15, 3],
    ],
  ]);
  await page.keyboard.press("c");
  await drag(page, [2, -6], [4, -6], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 4, -6);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("0.05");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("t");
  await diameter(page, 0.2);
  const original = (await inspect(page)).document;
  const a = await at(page, -10, -6),
    b = await at(page, 10, -6);
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  assert.equal(
    await highlights(page).count(),
    1,
    "tiny circle wholly inside the sweep is highlighted",
  );
  await page.mouse.up();
  await page.keyboard.up("Alt");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await lines(page, [
    [
      [-10, 0],
      [10, 0],
    ],
  ]);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0], ["Shift"]);
  await page.keyboard.press("t");
  await diameter(page, 0.2);
  await drag(page, [-10, 3], [10, 3], ["Alt"]);
  const curves = (await inspect(page)).document.sketches[0].curves;
  assert.equal(curves.length, 2);
  const arc = curves.find((c) => c.kind === "arc");
  assert.ok(arc);
  pointEquals(arc.a, [-6, 0]);
  pointEquals(arc.b, [6, 0]);
  close(arc.bulge, 1);
  console.log(
    `${name}: tiny circle inside a sparse sweep and circular-span brush-to-arc geometry passed`,
  );
}
