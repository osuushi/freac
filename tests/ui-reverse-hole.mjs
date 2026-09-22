import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { orient, pick } from "./ui-measurement.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/reverse-hole-cut.json", "utf8"));
async function selectRegion(page) {
  await page.getByRole("button", { name: "Select Sketch 3", exact: true }).click();
  assert.equal((await pick(page, [0, 1, 30])).modelingSelection[0]?.kind, "profile");
}
export async function reverseHoleRoute(page, name) {
  await reset(page);
  await page.getByRole("button", { name: "Sketch on YZ", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: "reverse-hole.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  await orient(page, [0.7, -0.6, 0.4]);
  const original = (await inspect(page)).document;
  await selectRegion(page);
  const handle = await page
    .getByRole("button", { name: "Drag extrusion", exact: true })
    .boundingBox();
  const anchor = await project(page, [0, 0, 30]);
  const end = await project(page, [-35, 0, 30]);
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + end.x - anchor.x, y + end.y - anchor.y, { steps: 8 });
  await page.mouse.up();
  let state = await inspect(page);
  assert.ok(state.preview, state.error);
  assert.ok(state.preview.bodies[0].volume > 41768 && state.preview.bodies[0].volume < 41769);
  assert.deepEqual(state.document, original, "Release keeps the cut temporary");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await selectRegion(page);
  const input = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  for (const distance of [-10, -25, -65]) {
    await input.fill(String(distance));
    state = await inspect(page);
    assert.ok(state.preview, state.error);
    assert.deepEqual(state.document, original);
    if (distance === -10) assert.ok(state.preview.bodies[0].volume > 45000);
    else
      assert.ok(state.preview.bodies[0].volume > 41768 && state.preview.bodies[0].volume < 41769);
  }
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  assert.ok(accepted.bodies[0].volume < original.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.mouse.move(1100, 750);
  await page.screenshot({ path: `.cache/sketch-review/${name}-reverse-hole.png` });
  await bodyArchiveRoute(page, `${name}-reverse-hole`);
  await page.mouse.move(640, 400);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 50);
  await page.keyboard.up("Control");
  await inspect(page);
  await orient(page, [0.7, -0.6, 0.4]);
  await page.getByRole("button", { name: "Hide Sketch 2", exact: true }).click();
  await pick(page, [0, 0, 54]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("o");
  await page.getByRole("textbox", { name: "Face offset distance", exact: true }).fill("-0.2");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.press("Escape");
  console.log(
    `${name}: captured reverse-hole drag, release, cancel, typed lengths, accept, Undo/Redo, Save/Open and subsequent Offset passed`,
  );
}
