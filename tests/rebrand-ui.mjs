import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(async (page, name) => {
  await reset(page);
  assert.match(await page.title(), /Makeshift/);
  assert.equal(await page.locator(".brand strong").textContent(), "Makeshift");
  assert.equal(
    await page.locator(".brand img").evaluate((img) => img.complete && img.naturalWidth === 512),
    true,
  );
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [20, 10]);
  await page.keyboard.press("Escape");
  const document = (await inspect(page)).document;
  const reopened = { ...document, bodies: document.bodies ?? [] };
  assert.equal(document.sketches[0].curves.length, 4);
  const path = resolve(`.cache/sketch-review/${name}-rebrand.makeshift`);
  await saveDocument(page, path);
  const archive = JSON.parse(await readFile(path, "utf8"));
  assert.equal(archive.format, "makeshift");
  await reset(page);
  await openDocument(page, path);
  await settled(page);
  // Electron retains undefined optional fields; compare the complete serializable model.
  assert.deepEqual(JSON.parse(JSON.stringify((await inspect(page)).document)), reopened);
  const legacy = path.replace(/\.makeshift$/, ".freac");
  await writeFile(legacy, JSON.stringify({ ...archive, format: "freac" }));
  await reset(page);
  await openDocument(page, legacy);
  await settled(page);
  assert.deepEqual(JSON.parse(JSON.stringify((await inspect(page)).document)), reopened);
  console.log(`${name}: branding, pointer-created geometry, Makeshift Save/Open and legacy Open`);
});
