import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arcAt } from "../.cache/sketch-tests/src/sketch/arc-geometry.js";
import { openDocument } from "./native-documents.mjs";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(readFileSync("tests/fixtures/second-corner-fillet.json", "utf8"));
export async function secondCornerFilletRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "second-corner.freac",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "freac", version: 1, document: fixture.document }),
    ),
  });
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("v");
  const before = (await inspect(page)).document;
  const corner = before.sketches[0].curves[0].b;
  await click(page, corner.x, corner.y);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document;
  const sketch = accepted.sketches[0];
  assert.equal(sketch.curves.length, 4, await page.getByRole("status").textContent());
  assert.equal(sketch.constraints.filter((c) => c.kind === "tangent").length, 4);
  const first = before.sketches[0].curves[2];
  const kept = sketch.curves.find((c) => c.id === first.id);
  assert.ok(Math.hypot(first.a.x - kept.a.x, first.a.y - kept.a.y) < 1e-7);
  assert.ok(Math.hypot(first.b.x - kept.b.x, first.b.y - kept.b.y) < 1e-7);
  assert.ok(Math.abs(first.bulge - kept.bulge) < 1e-7);
  await click(page, 30, 25);
  const point = arcAt(sketch.curves.at(-1), 0.3);
  await click(page, point.x, point.y);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  const resized = (await inspect(page)).document;
  assert.notDeepEqual(resized, accepted);
  assert.equal(resized.sketches[0].curves.length, 4);
  await page.screenshot({ path: `.cache/sketch-review/${name}-second-corner-fillet.png` });
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  // Use the real guide drag for the same second corner after Undo.
  await click(page, corner.x, corner.y);
  const from = await filletGuidePoint(page);
  const to = await at(page, -5.4, -7.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  assert.equal(
    (await inspect(page)).document.sketches[0].curves.length,
    4,
    await page.getByRole("status").textContent(),
  );
  console.log(`${name}: captured second corner fillet, radius editing, Undo and guide drag passed`);
}
