import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(
  await readFile("tests/fixtures/extrude-projected-cylinder.json", "utf8"),
);
await withUiRuntimes(
  async (page, name) => {
    await openDocument(page, {
      name: "projected-cylinder.freac",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
      ),
    });
    const before = (await inspect(page)).document;
    // View the sketch from below so the cylinder does not obscure its selectable region.
    await orient(page, [0, 0, -1]);
    const point = await project(page, [0, 0, 0]);
    await page.mouse.click(point.x, point.y);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
    await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("40");
    await page.keyboard.press("Enter");
    let state = await inspect(page);
    assert.match(await page.getByRole("alert").innerText(), /could not mesh every face/);
    assert.deepEqual(state.document, before);
    await page.getByRole("button", { name: "New body", exact: true }).click();
    state = await inspect(page);
    assert.equal(state.preview.bodies.length, 2);
    assert.ok(state.preview.bodies.at(-1).faces.every((face) => face.vertices.length >= 9));
    await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
    assert.equal((await inspect(page)).document.bodies.length, 2);
    await chooseTool(page, "Undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "Redo", "redo");
    assert.equal((await inspect(page)).document.bodies.length, 2);
    await page.keyboard.press("Escape");
    state = await inspect(page);
    assert.equal(state.preview, null);
    await page.screenshot({ path: `.cache/sketch-review/${name}-extrude-projected-cylinder.png` });
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    assert.equal((await inspect(page)).activePlane, "XY");
    console.log(
      `${name}: captured extrusion rejects incomplete geometry; New body recovery, acceptance, Undo/Redo and continued editing pass`,
    );
  },
  { defaults: ["chromium", "webkit"] },
);
