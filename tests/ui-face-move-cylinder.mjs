import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function cylinderFaceMoveRoute(page, name) {
  const fixture = JSON.parse(readFileSync("tests/fixtures/hole-in-cylinder.json", "utf8"));
  await reset(page);
  await page.getByRole("button", { name: "Sketch on XY", exact: true }).click();
  await inspect(page);
  await chooseTool(page, "return to modeling", "modeling");
  await inspect(page);
  await openDocument(page, {
    name: "hole-in-cylinder.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 1);
  const original = (await inspect(page)).document;
  await page.mouse.move(1000, 650);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -50);
  await page.keyboard.up("Alt");
  await inspect(page);
  await worldClick(page, [9, 10, 40]);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, fixture.operation.faces[0].face);
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move faces Y", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Face translation Y", exact: true });
  await input.fill("11");
  let state = await inspect(page);
  assert.ok(state.preview, await page.getByRole("status").textContent());
  close(state.preview.bodies[0].volume, original.bodies[0].volume);
  await input.fill("40");
  await inspect(page);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal(await page.getByRole("button", { name: "Accept face movement" }).isEnabled(), false);
  await input.fill("11");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(
    state.document.bodies[0].faces.find((f) => f.id === fixture.operation.faces[0].face).cylinder
      .origin[1],
    16,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, state.document);
  console.log(
    `${name}: captured hole in cylindrical stock moves, rejects breakout and preserves history`,
  );
}
