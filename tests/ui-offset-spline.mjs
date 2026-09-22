import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/offset-bent-shell.json", "utf8"));
async function limitAndDrag(page, input, original) {
  await input.fill("-2");
  // Invalid requests search for a verified limit through multiple native offsets.
  await page.waitForFunction(() => !window.freacInspect().busy, null, { timeout: 120_000 });
  let state = await inspect(page);
  assert.ok(Number(await input.inputValue()) > -1.5);
  assert.ok(state.preview?.bodies[0].volume > 0);
  assert.deepEqual(state.document, original);
  const handle = page.getByRole("button", { name: "Offset faces", exact: true });
  assert.equal(await handle.getAttribute("data-geometry-invalid"), "true");
  await input.fill("0");
  await inspect(page);
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((b) => ({
    x: Number(b.dataset.directionX),
    y: Number(b.dataset.directionY),
  }));
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + direction.x * 6, y + direction.y * 6, { steps: 3 });
  await page.mouse.up();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.ok(state.preview?.bodies[0].volume > original.bodies[0].volume);
  assert.ok(Number(await input.inputValue()) > 0);
}
async function enterOffset(page) {
  await worldClick(page, [18, 2, -8]);
  const state = await inspect(page);
  assert.ok(
    fixture.operation.faces.some((f) => f.face === state.modelingSelection[0]?.face),
    `Pick the inner wall: ${JSON.stringify(state.modelingSelection)}`,
  );
  await page.keyboard.press("o");
  if (await page.getByRole("textbox", { name: "Face diameter", exact: true }).isVisible())
    await page.getByRole("button", { name: "Switch offset measurement", exact: true }).click();
  return page.getByRole("textbox", { name: "Face offset distance", exact: true });
}
export async function offsetSplineRoute(page, name) {
  await reset(page);
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await openDocument(page, {
    name: "offset-bent-shell.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  const original = (await inspect(page)).document;
  const input = await enterOffset(page);
  for (const distance of [0.5, 1, -1, 7.5]) {
    await input.fill(String(distance));
    const state = await inspect(page);
    assert.deepEqual(state.document, original);
    assert.equal(Number(await input.inputValue()), distance, state.notice);
    const body = state.preview?.bodies[0];
    assert.ok(body);
    for (const face of body.faces.filter((f) => f.cylinder)) {
      const selected = fixture.operation.faces.some((entry) => entry.face === face.id);
      assert.ok(Math.abs(face.cylinder.radius - (selected ? 8 - distance : 9.5)) < 1e-6);
    }
  }
  await limitAndDrag(page, input, original);
  await input.fill("1");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-offset-spline.png` });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await enterOffset(page);
  await input.fill("1");
  await inspect(page);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  assert.ok(after.bodies[0].volume > original.bodies[0].volume);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await bodyArchiveRoute(page, `${name}-offset-spline`);
  // The new inner radius is seven; reselect its offset support after reopening.
  await worldClick(page, [18, 2, -7]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("o");
  if (await page.getByRole("textbox", { name: "Face diameter", exact: true }).isVisible())
    await page.getByRole("button", { name: "Switch offset measurement", exact: true }).click();
  await input.fill("-1");
  let state = await inspect(page);
  assert.equal(Number(await input.inputValue()), -1);
  assert.ok(Math.abs(state.preview.bodies[0].volume - original.bodies[0].volume) < 1e-4);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].volume - original.bodies[0].volume) < 1e-4);
  console.log(
    `${name}: captured spline Offset selection, signed entry, drag, limit recovery, cancellation, Undo/Redo, Save/Open and reverse re-edit pass`,
  );
}
