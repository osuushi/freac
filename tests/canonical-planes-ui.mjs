import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { canonicalPlanesRoute } from "./ui-canonical-planes.mjs";
import { planeTargetsRoute } from "./ui-plane-targets.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
await server.watcher.close();
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
      if (app)
        assert.equal(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
          false,
        );
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.setDefaultTimeout(12000);
      if (browser) await page.goto(server.resolvedUrls.local[0]);
      await planeTargetsRoute(page, name);
      await canonicalPlanesRoute(page, name);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
