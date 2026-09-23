import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { transformBoxRoute } from "./ui-transform-box.mjs";
import { transformSketchPlacementRoute, transformSolidRoute } from "./ui-transform-solids.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
async function run(page, name) {
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await transformBoxRoute(page, name);
    await transformSolidRoute(page, name);
    await transformSolidRoute(page, `${name}-curved`, true);
    await transformSketchPlacementRoute(page, name);
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: `.cache/sketch-review/${name}-transform-failure.png` });
    console.log(
      await page.evaluate(() => ({
        state: window.freacInspect(),
        status: document.querySelector("[role=status]")?.textContent,
      })),
    );
    throw error;
  }
}
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await run(page, name);
    } finally {
      await browser.close();
    }
  }
  if (!process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === "electron") {
    const app = await launchElectron({
      args: ["."],
      env: { ...process.env, FREAC_TEST_HIDDEN: "1", FREAC_DEV_URL: server.resolvedUrls.local[0] },
    });
    try {
      const page = await app.firstWindow();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      await run(page, "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
