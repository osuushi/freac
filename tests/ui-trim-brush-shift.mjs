import assert from "node:assert/strict";
import { at, inspect, pointEquals } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { diameter, highlights, lines } from "./ui-trim-brush-helpers.mjs";

async function combinedScene(page) {
  await lines(page, [
    [
      [-10, 0],
      [0, 0],
    ],
    [
      [0, 0],
      [10, 0],
    ],
    [
      [-10, 2],
      [0, 2],
    ],
    [
      [0, 2],
      [10, 2],
    ],
    [
      [-6, -6],
      [-6, 8],
    ],
    [
      [6, -6],
      [6, 8],
    ],
    [
      [0, 2],
      [0, 8],
    ],
  ]);
  await diameter(page, 2.2);
}

export async function trimBrushShiftBoundaryRoute(page, name) {
  await combinedScene(page);
  const original = (await inspect(page)).document,
    a = await at(page, -3, 1),
    b = await at(page, -2, 1);
  await page.mouse.move(a.x, a.y);
  await page.keyboard.down("Alt");
  assert.equal(await highlights(page).count(), 2);
  await page.keyboard.down("Shift");
  assert.equal(await highlights(page).count(), 3, "both keys expand the unbranched target's chain");
  assert.equal(await page.locator(".trim-brush-circle").isVisible(), true);
  assert.equal(await page.locator(".trim-brush-controls").isVisible(), true);
  await page.keyboard.up("Shift");
  assert.equal(await highlights(page).count(), 2, "releasing Shift restores ordinary brush cuts");
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  assert.equal(await highlights(page).count(), 3);
  assert.deepEqual((await inspect(page)).document, original, "combined stroke stays temporary");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Alt");
  const after = (await inspect(page)).document,
    curves = after.sketches[0].curves;
  assert.equal(curves.length, 7);
  const expected = [
    [
      [-10, 0],
      [-6, 0],
    ],
    [
      [6, 0],
      [10, 0],
    ],
    [
      [-10, 2],
      [-6, 2],
    ],
  ];
  for (const [i, [a, b]] of expected.entries()) {
    const curve = curves.find((c) => c.id === original.sketches[0].curves[i].id);
    assert.ok(curve);
    pointEquals(curve.a, a);
    pointEquals(curve.b, b);
  }
  assert.deepEqual(
    curves.slice(3),
    original.sketches[0].curves.slice(3),
    "branch and crossing references bound chain removal",
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "one Undo restores every combined brush target",
  );
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  console.log(
    `${name}: Option+Shift multi-target brush, stationary policy changes, crossing/branch bounds and one Undo/Redo passed`,
  );
}

export async function trimBrushShiftOverlapRoute(page, name) {
  await lines(page, [
    [
      [-10, 0],
      [10, 0],
    ],
    [
      [-4, 0],
      [4, 0],
    ],
    [
      [-6, -6],
      [-6, 6],
    ],
    [
      [6, 0],
      [6, 6],
    ],
  ]);
  await diameter(page, 0.2);
  const original = (await inspect(page)).document,
    p = await at(page, 5, 0);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.down("Shift");
  await page.keyboard.down("Alt");
  assert.equal(
    await highlights(page).count(),
    2,
    "both keys ignore overlap ends and show the full coincident removal",
  );
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Shift");
  const after = (await inspect(page)).document,
    curves = after.sketches[0].curves;
  assert.equal(curves.length, 4);
  pointEquals(curves[0].a, [-10, 0]);
  pointEquals(curves[0].b, [-6, 0]);
  pointEquals(curves[1].a, [6, 0]);
  pointEquals(curves[1].b, [10, 0]);
  assert.deepEqual(curves.slice(2), original.sketches[0].curves.slice(2));
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Shift-first Option+Shift brush ignores overlap endpoints, retains crossing/T cuts and restores with one Undo passed`,
  );
}
