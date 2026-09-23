import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { backendPersistence } from "./ui-backend.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-document-web-"));
const server = await createServer({ cacheDir: join(root, "vite"), server: { port: 0 } });
try {
  await server.listen();
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await reset(page);
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("l");
      await drag(page, [0, 0], [20, 10]);
      const line = (await inspect(page)).document.sketches[0].curves[0];
      assert.deepEqual(line.b, { x: 20, y: 10 });
      await page.keyboard.press("Control+z");
      assert.equal((await inspect(page)).document.sketches.length, 0);
      await page.keyboard.press("Control+Shift+z");
      assert.deepEqual((await inspect(page)).document.sketches[0].curves[0], line);
      await backendPersistence(page, name);
      const before = (await inspect(page)).document;
      const downloaded = page.waitForEvent("download");
      await chooseTool(page, "save document", "save");
      const download = await downloaded;
      const path = join(root, `${name}.freac`);
      await download.saveAs(path);
      await reset(page);
      await page.getByLabel("Open Freac file").setInputFiles(path);
      await page.waitForFunction(() => window.freacInspect().document.sketches.length === 1);
      assert.deepEqual((await inspect(page)).document.sketches, before.sketches);
      console.log(`${name}: browser download/upload, drawing and Undo remain working`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await rm(root, { recursive: true, force: true });
}
