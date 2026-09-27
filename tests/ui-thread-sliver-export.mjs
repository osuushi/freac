import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { createServer } from "vite";
import { openDocument } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(
  await readFile(process.argv[2] ?? "tests/fixtures/thread-boolean-sliver.json", "utf8"),
);
const document = fixture.snapshot?.document ?? fixture.document;
await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.resolvedUrls.local[0]);
      await inspect(page);
      await openDocument(page, {
        name: "thread-boolean-sliver.freac",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ format: "freac", version: 1, document })),
      });
      const before = (await inspect(page)).document;
      const waiting = page.waitForEvent("download");
      await chooseTool(page, "export 3mf", "export-3mf");
      const download = await waiting;
      const path = resolve(`.cache/sketch-review/${name}-thread-boolean-sliver.3mf`);
      await download.saveAs(path);
      const xml = strFromU8(unzipSync(await readFile(path))["3D/3dmodel.model"]);
      assert.equal((xml.match(/<item /g) ?? []).length, document.bodies.length);
      assert.ok((xml.match(/<triangle /g) ?? []).length > 10000);
      assert.deepEqual((await inspect(page)).document, before);
      if (document.bodies.length > 1) {
        await page
          .getByRole("button", { name: /^Hide (?!Sketch|bodies)[A-Z]/ })
          .first()
          .click();
        const hiddenDownload = page.waitForEvent("download");
        await chooseTool(page, "export 3mf", "export-3mf");
        const hiddenPath = resolve(`.cache/sketch-review/${name}-visible-threaded-bodies.3mf`);
        await (await hiddenDownload).saveAs(hiddenPath);
        const visibleXml = strFromU8(unzipSync(await readFile(hiddenPath))["3D/3dmodel.model"]);
        assert.equal((visibleXml.match(/<item /g) ?? []).length, document.bodies.length - 1);
        assert.deepEqual((await inspect(page)).document, before);
      }
      assert.deepEqual(errors, []);
      console.log(`${name}: tilted threaded hole exports 3MF through the UI`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
