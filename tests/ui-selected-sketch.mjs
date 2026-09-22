import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";

export async function selectedSketchRoute(page, name) {
  await plate(page);
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await clearSelection(page);
  await orient(page, [0.4, -1, 0.7]);
  const original = (await inspect(page)).document;
  const history = await page.evaluate(() => window.freacHistory());
  assert.equal((await pick(page, [0, 0, 0])).modelingSelection[0]?.kind, "face");
  await page
    .getByRole("button", { name: /^Select Sketch/ })
    .first()
    .click();
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "sketch");
  await page.mouse.move(900, 700);
  await page.screenshot({ path: `.cache/sketch-review/${name}-selected-sketch.png` });
  assert.equal((await pick(page, [0, 0, 0])).modelingSelection[0]?.kind, "profile");
  await clearSelection(page);
  assert.equal((await pick(page, [0, 0, 0])).modelingSelection[0]?.kind, "face");
  await page
    .getByRole("button", { name: /^Select Sketch/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Hide Sketch/ })
    .first()
    .click();
  assert.equal((await pick(page, [0, 0, 0])).modelingSelection[0]?.kind, "face");
  await page
    .getByRole("button", { name: /^Show Sketch/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Select Sketch/ })
    .first()
    .click();
  await orient(page, [0, -1, 0.3]);
  await orient(page, [0, -0.3, -1]);
  assert.equal((await pick(page, [0, 0, 0])).modelingSelection[0]?.kind, "profile");
  assert.deepEqual((await inspect(page)).document, original);
  assert.deepEqual(await page.evaluate(() => window.freacHistory()), history);
  console.log(
    `${name}: selected sketch occluded/visible region picking, deselection, visibility and unchanged history passed`,
  );
}
