import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        acceptDownloads: true,
      });
      page.setDefaultTimeout(15000);
      await page.goto(server.resolvedUrls.local[0]);
      await settled(page);
      const initial = (await inspect(page)).camera;
      const bounds = await page.locator('canvas[aria-label="Modeling viewport"]').boundingBox();
      assert.ok(bounds);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(150, -90);
      await settled(page);
      const moved = (await inspect(page)).camera;
      assert.notDeepEqual(moved.target, initial.target);
      const waiting = page.waitForEvent("download");
      await chooseTool(page, "Save document", "save");
      const download = await waiting;
      const path = await download.path();
      const archive = JSON.parse(await readFile(path, "utf8"));
      assert.deepEqual(archive.camera.target, moved.target);
      await chooseTool(page, "New document", "new");
      assert.deepEqual((await inspect(page)).camera.target, initial.target);
      const choosing = page.waitForEvent("filechooser");
      await chooseTool(page, "Open document", "open");
      await (await choosing).setFiles(path);
      await settled(page);
      await page.waitForFunction(
        (target) =>
          JSON.stringify(window.makeshiftInspect().camera.target) === JSON.stringify(target),
        moved.target,
      );
      assert.deepEqual((await inspect(page)).camera.target, moved.target);
      console.log(`${name}: camera download/open passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
