import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { orient, outwardDrag } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(readFileSync("tests/fixtures/collapsed-offset-wall.json", "utf8"));
const area = Math.PI * 13.038404810405298 ** 2;
async function captured(page, bottom) {
  await reset(page);
  await openDocument(page, {
    name: "collapsed-wall.freac",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "freac", version: 1, document: fixture })),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  await orient(page, [1, -1, bottom ? -1 : 1]);
  const z = bottom ? 0 : 11.00048828125;
  await worldClick(page, [2, 2, z]);
  const state = await inspect(page);
  const face = state.document.bodies[0].faces.find(
    (f) => f.plane && Math.abs(f.plane.origin[2] - z) < 1e-6,
  );
  assert.equal(state.modelingSelection[0]?.face, face.id);
  return { original: state.document, face };
}
export async function offsetCollapseRoute(page, name, app) {
  for (const bottom of [false, true]) {
    const { original, face } = await captured(page, bottom);
    await page.keyboard.press("o");
    const input = page.getByRole("textbox", { name: "Face offset distance", exact: true });
    for (const distance of [-2, -5, 2, -2]) {
      await input.fill(String(distance));
      const state = await inspect(page);
      close(Number(await input.inputValue()), distance);
      close(state.preview.bodies[0].volume, area * (11.00048828125 + distance));
      assert.equal(state.preview.bodies[0].faces.length, 3);
      assert.equal(state.modelingSelection[0]?.face, face.id);
      assert.deepEqual(state.document, original);
    }
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    const preview = await outwardDrag(
      page,
      "Offset faces",
      {
        offsetHandle: {
          center: [0, 0, bottom ? 0 : 11.00048828125],
          normal: [0, 0, bottom ? -1 : 1],
        },
      },
      -2,
    );
    close(preview.preview.bodies[0].volume, area * 9.00048828125);
    await page.keyboard.press("Enter");
    const accepted = (await inspect(page)).document;
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await bodyArchiveRoute(page, `${name}-collapse-${bottom}`, app);
    await orient(page, [1, -1, bottom ? -1 : 1]);
    await worldClick(page, [2, 2, bottom ? 2 : 9.00048828125]);
    await page.keyboard.press("o");
    await input.fill("-1");
    close((await inspect(page)).preview.bodies[0].volume, area * 8.00048828125);
    await page.keyboard.press("Enter");
  }
  await stacked(page);
  const original = (await inspect(page)).document;
  await worldClick(page, [2, 2, 21]);
  await page.keyboard.press("o");
  const input = page.getByRole("textbox", { name: "Face offset distance", exact: true });
  for (const distance of [-5, -10, -15, -19, -5]) {
    await input.fill(String(distance));
    const state = await inspect(page);
    close(Number(await input.inputValue()), distance);
    close(state.preview.bodies[0].volume, Math.PI * 100 * (21 + distance));
    assert.equal(state.preview.bodies[0].faces.length, distance <= -10 ? 3 : 4);
    assert.deepEqual(state.document, original);
  }
  await page.keyboard.press("Escape");
  console.log(
    `${name}: captured top/bottom Offset, drag/cancel, Undo/Redo, Save/Open/re-edit and clean wall collapse passed`,
  );
}
async function stacked(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("Enter");
  const pick = await at(page, 2, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("11");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await inspect(page);
  await worldClick(page, [2, 2, 11]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("10");
  await inspect(page);
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  assert.equal((await inspect(page)).document.bodies[0].faces.length, 4);
}
