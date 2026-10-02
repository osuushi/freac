import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const sketch = JSON.parse(readFileSync("tests/fixtures/trim-projected-ovals.json", "utf8"));
await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await openDocument(page, {
      name: "projected-ovals.freac",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "freac",
          version: 1,
          document: { units: "mm", sketches: [sketch], bodies: [] },
        }),
      ),
    });
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    const original = (await inspect(page)).document;
    await page.keyboard.press("t");
    const p = await at(page, -4.85, 23);
    await page.mouse.move(p.x, p.y);
    assert.equal(await page.locator(".trim-span").count(), 1);
    await page.keyboard.down("Shift");
    assert.equal(await page.locator(".trim-span").count(), 12);
    const ids = await page
      .locator(".trim-span")
      .evaluateAll((marks) => marks.map((m) => m.dataset.curve));
    assert.deepEqual(
      ids.sort(),
      sketch.curves
        .slice(36, 48)
        .map((c) => c.id)
        .sort(),
    );
    await page.keyboard.up("Shift");
    assert.equal(await page.locator(".trim-span").count(), 1);
    await page.keyboard.down("Shift");
    await page.screenshot({ path: `.cache/sketch-review/${name}-trim-chain.png` });
    await click(page, -4.85, 23);
    await page.keyboard.up("Shift");
    const after = (await inspect(page)).document;
    assert.equal(after.sketches[0].curves.length, 44);
    assert.equal(await page.locator(".trim-span").getAttribute("points"), "");
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, after);
    await page.keyboard.press("v");
    await click(page, 5.5, 36);
    await page.keyboard.press("m");
    await drag(page, [5.5, 36], [6.5, 37], ["Shift"]);
    assert.notDeepEqual((await inspect(page)).document, after);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, after);
    await page.keyboard.press("t");
    const q = await at(page, 4.85, 23);
    await page.mouse.move(q.x, q.y);
    await page.keyboard.down("Shift");
    assert.ok((await page.locator(".trim-span").count()) > 1);
    await click(page, 4.85, 23);
    await page.keyboard.up("Shift");
    assert.ok((await inspect(page)).document.sketches[0].curves.length < 44);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, after);
    console.log(
      `${name}: captured projected oval chain highlight, Shift toggle, atomic trim/Undo/Redo, remnant movement and second chain trim passed`,
    );
  },
  { defaults: ["chromium", "webkit", "electron"] },
);
