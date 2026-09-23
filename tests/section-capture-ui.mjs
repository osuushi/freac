import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron, openDocument } from "./native-documents.mjs";
import { at, inspect } from "./ui-helpers.mjs";
import { sketchSectionsRoute } from "./ui-sketch-sections.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/section-filleted-junction.json", "utf8"));
const archive = {
  format: "freac",
  version: 1,
  document: {
    units: "mm",
    sketches: [],
    bodies: [fixture.body],
  },
};
await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  const engines =
    process.env.FREAC_TEST_BROWSER === "electron" ? { electron: null } : { chromium, webkit };
  for (const [name, engine] of Object.entries(engines)) {
    const browser = engine ? await engine.launch({ headless: true }) : null;
    const app = engine
      ? null
      : await launchElectron({
          args: [process.cwd()],
          env: {
            ...process.env,
            FREAC_TEST_HIDDEN: "1",
            FREAC_DEV_URL: server.resolvedUrls.local[0],
          },
        });
    try {
      const page = app
        ? await app.firstWindow()
        : await browser.newPage({ viewport: { width: 1280, height: 850 } });
      page.setDefaultTimeout(20000);
      if (!app) await page.goto(server.resolvedUrls.local[0]);
      await inspect(page);
      await openDocument(page, {
        name: "section.freac",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(archive)),
      });
      await inspect(page);
      await page.getByRole("button", { name: "Sketch on XZ", exact: true }).click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[role="status"]')
            ?.textContent.includes("Calculating cross sections"),
      );
      const point = await at(page, 0, -20);
      await page.mouse.move(point.x, point.y);
      await page.waitForFunction(() => document.querySelector("canvas").style.cursor === "pointer");
      await page.screenshot({ path: `.cache/sketch-review/${name}-captured-section.png` });
      await page.mouse.click(point.x, point.y);
      const copied = (await inspect(page)).document;
      assert.equal(copied.sketches.length, 1);
      assert.equal(copied.sketches[0].curves.length, 31);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.sketches.length, 0);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document.sketches, copied.sketches);
      await sketchSectionsRoute(page, name);
      console.log(
        `${name}: captured section hover/copy/Undo/Redo and adjacent section editing passed`,
      );
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
