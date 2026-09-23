import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportDocument, openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

function checkWall(body, thickness) {
  assert.ok(body.volume > 0 && body.volume < 52320.530970243155);
  const heights = body.faces.flatMap((f) => (f.plane ? [f.plane.origin[2]] : []));
  for (const z of [-14, 14, -14 - thickness])
    assert.ok(heights.some((h) => Math.abs(h - z) < 1e-7));
  const radii = body.faces.flatMap((f) => (f.cylinder ? [f.cylinder.radius] : []));
  for (const r of [14, 14 + thickness, 20.09975124224179 + thickness])
    assert.ok(radii.some((radius) => Math.abs(radius - r) < 1e-7));
}
export async function shellSourcePrecisionRoute(page, name) {
  const fixture = JSON.parse(
    await readFile("tests/fixtures/shell-conservative-vertices.json", "utf8"),
  );
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: "shell-input.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  for (let i = 1; i <= fixture.document.sketches.length; i++)
    await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).click();
  await worldClick(page, [16, 5, 14]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.opening);
  const before = (await inspect(page)).document;
  await page.keyboard.press("s");
  const field = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await field.fill("-2");
  checkWall((await inspect(page)).preview.bodies[0], -2);
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("s");
  await field.fill("2");
  checkWall((await inspect(page)).preview.bodies[0], 2);
  await field.fill("-2");
  checkWall((await inspect(page)).preview.bodies[0], -2);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  checkWall(after.bodies[0], -2);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  for (const format of ["stl", "3mf"])
    await exportDocument(
      page,
      format,
      resolve(`.cache/sketch-review/${name}-source-shell.${format}`),
    );
  await bodyArchiveRoute(page, `${name}-source-shell`);
  checkWall((await inspect(page)).document.bodies[0], -2);
  await worldClick(page, [16, 5, -12]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await page.screenshot({ path: `.cache/sketch-review/${name}-source-shell.png` });
  console.log(
    `${name}: captured shell ±2, cancel, accept, history, exports, Save/Open and face reselection passed`,
  );
}
