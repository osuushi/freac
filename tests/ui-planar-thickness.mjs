import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function planarThicknessRoute(page) {
  const fixture = JSON.parse(await readFile("tests/fixtures/offset-planar-thickness.json", "utf8"));
  await reset(page);
  await openDocument(page, {
    name: "planar-thickness.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await inspect(page);
  await page.mouse.move(640, 425);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 80);
  await page.keyboard.up("Control");
  await inspect(page);
  await orient(page, [0, 1, 0.3]);
  const center = await project(page, [76, 14, 0]);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(640, 425, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await inspect(page);
  await worldClick(page, [76, 16, 0]);
  const original = (await inspect(page)).document;
  const plate = original.bodies.find((b) => b.id === "899e5da8-75eb-4230-9ac3-6914dbdbfcf8");
  const selected = (await inspect(page)).modelingSelection[0];
  assert.equal(
    selected?.face,
    "549eb4c1-67da-45f3-a0e7-978a5a8e4143",
    JSON.stringify({
      camera: (await inspect(page)).camera,
      point: await project(page, [76, 16, 0]),
      selected,
    }),
  );
  const field = page.getByRole("textbox", { name: "Face thickness", exact: true });
  close(Number(await field.inputValue()), 4);
  await field.fill("5");
  let state = await inspect(page);
  const cap = plate.faces.find((f) => f.id === selected.face);
  const expected = plate.volume + cap.signature[2];
  close(state.preview.bodies.find((b) => b.id === plate.id).volume, expected);
  assert.deepEqual(state.document, original);
  await page.getByRole("combobox", { name: "Offset mode" }).selectOption("offset");
  close(Number(await page.getByRole("textbox", { name: "Face offset distance" }).inputValue()), 1);
  await page.getByRole("combobox", { name: "Offset mode" }).selectOption("thickness");
  close(Number(await field.inputValue()), 5);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies.find((b) => b.id === plate.id).volume, expected);
  close(Number(await field.inputValue()), 5);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies.find((b) => b.id === plate.id).volume, expected);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [76, 12, 0]);
  assert.equal(
    (await inspect(page)).modelingSelection[0]?.face,
    "0b6195ce-e316-4ccd-bc2c-c196d103e17b",
  );
  // The small recessed patch is nearer than the main opposite cap.
  close(Number(await field.inputValue()), 2);
  await field.fill("3");
  state = await inspect(page);
  const back = plate.faces.find((f) => f.id === "0b6195ce-e316-4ccd-bc2c-c196d103e17b");
  close(state.preview.bodies.find((b) => b.id === plate.id).volume, expected + back.signature[2]);
  await page.screenshot({ path: ".cache/sketch-review/planar-thickness.png" });
  await page.keyboard.press("Escape");
  close((await inspect(page)).document.bodies.find((b) => b.id === plate.id).volume, expected);
  console.log(
    "Captured planar thickness: 4→5 mm, relative toggle, nearest recessed wall, fixed-reference edits, accept/cancel and Undo/Redo passed",
  );
}
