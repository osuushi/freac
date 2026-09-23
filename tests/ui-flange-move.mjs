import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { close, inspect, reset } from "./ui-helpers.mjs";
import { quantity, startMove } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/threaded-flange-move.json", "utf8"));
async function selectFlange(page, rise = 0) {
  for (const [i, [point, view]] of [
    [
      [7, 0, 13.5 + rise],
      [1, 0, -1],
    ],
    [
      [11, 0, 14.5 + rise],
      [1, 0, 0.1],
    ],
  ].entries()) {
    await orient(page, view);
    const p = await project(page, point);
    await page.mouse.click(p.x, p.y, { modifiers: i ? ["Shift"] : [] });
    const state = await inspect(page);
    if (i === 0) assert.equal(state.modelingSelection[0].face, fixture.operation.faces[0].face);
  }
  assert.deepEqual(
    (await inspect(page)).modelingSelection.map((s) => s.face).sort(),
    fixture.operation.faces.map((s) => s.face).sort(),
  );
}
function check(state, original, distance) {
  const moved = state.preview?.bodies[0];
  assert.ok(moved, "Move must produce a preview");
  close(moved.bounds[5], original.bodies[0].bounds[5] + distance);
  close(moved.bounds[2], original.bodies[0].bounds[2]);
  assert.ok(
    Math.abs(moved.volume - original.bodies[0].volume - Math.PI * 3.5 ** 2 * distance) < 1e-4,
  );
  assert.deepEqual(state.document, original);
}
export async function flangeMoveRoute(page, name, electron) {
  await reset(page);
  await openDocument(page, {
    name: "flange.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  const original = (await inspect(page)).document;
  await selectFlange(page);
  await chooseTool(page, "transform", "transform");
  await orient(page, [1, 0, 0.2]);
  const box = await page.getByRole("button", { name: "Move faces Z", exact: true }).boundingBox();
  const a = await project(page, [0, 0, 14.5]),
    b = await project(page, [0, 0, 16.5]);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + b.x - a.x, y + b.y - a.y, { steps: 5 });
  await page.mouse.up();
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await startMove(page);
  check(await quantity(page, "faces", "Z", 2), original, 2);
  await page.screenshot({ path: `.cache/sketch-review/${name}-flange-move.png` });
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  close(accepted.bodies[0].bounds[5], original.bodies[0].bounds[5] + 2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-flange`, electron);
  const reopened = (await inspect(page)).document;
  await selectFlange(page, 2);
  await chooseTool(page, "transform", "transform");
  check(await quantity(page, "faces", "Z", -2), reopened, -2);
  await page.getByRole("button", { name: "Accept face movement", exact: true }).click();
  close((await inspect(page)).document.bodies[0].bounds[5], original.bodies[0].bounds[5]);
  console.log(
    `${name}: captured flange picks, drags, moves +2, cancels, Undo/Redo, Save/Open and reverse Move pass`,
  );
}
