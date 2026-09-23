import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportDocument, openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const gap = 9.78;
function merged(body, height) {
  assert.equal(body.faces.length, 6, "The internal boundary and its thin walls must disappear");
  const caps = body.faces.filter((f) => f.plane);
  assert.equal(caps.length, 2);
  const top = caps.find((f) => f.plane.origin[1] < -1);
  assert.ok(top);
  assert.ok(Math.abs(-top.plane.origin[1] - height) < 1e-7);
  assert.ok(Math.abs(body.volume - 1215.503931867781 * height) < 1e-6);
}
export async function offsetDecimalRoute(page, name) {
  const fixture = JSON.parse(await readFile("tests/fixtures/offset-decimal-contact.json", "utf8"));
  await reset(page);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await openDocument(page, {
    name: "contact.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  for (let i = 1; i <= fixture.document.sketches.length; i++)
    await page.getByRole("button", { name: `Hide Sketch ${i}`, exact: true }).click();
  await worldClick(page, [18, -2, 12]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.floor);
  const before = (await inspect(page)).document;
  await chooseTool(page, "offset faces", "offset");
  const field = page.getByRole("textbox", { name: "Face offset distance", exact: true });
  await field.fill(String(gap));
  merged((await inspect(page)).preview.bodies[0], 11.78);
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "offset faces", "offset");
  await field.fill("38");
  merged((await inspect(page)).preview.bodies[0], 40);
  assert.equal(Number(await field.inputValue()), 38);
  await field.fill(String(gap));
  merged((await inspect(page)).preview.bodies[0], 11.78);
  await page.keyboard.press("Enter");
  const after = (await inspect(page)).document;
  merged(after.bodies[0], 11.78);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await worldClick(page, [18, -11.78, 12]);
  await chooseTool(page, "offset faces", "offset");
  await field.fill("2");
  merged((await inspect(page)).preview.bodies[0], 13.78);
  await page.keyboard.press("Enter");
  merged((await inspect(page)).document.bodies[0], 13.78);
  await page.screenshot({ path: `.cache/sketch-review/${name}-decimal-contact.png` });
  for (const format of ["stl", "3mf"])
    await exportDocument(
      page,
      format,
      resolve(`.cache/sketch-review/${name}-decimal-contact.${format}`),
    );
  await bodyArchiveRoute(page, `${name}-decimal-contact`);
  merged((await inspect(page)).document.bodies[0], 13.78);
  console.log(
    `${name}: exact contact, continuation, cancellation, history, reselection, exports and Save/Open passed`,
  );
}
