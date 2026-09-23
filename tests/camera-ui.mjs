import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { cameraRoute } from "./ui-camera.mjs";
import { redrawRoute } from "./ui-camera-redraw.mjs";
import { trackballRoute } from "./ui-camera-trackball.mjs";
import { orientationCubeRoute } from "./ui-orientation-cube.mjs";
import { planeTargetsRoute } from "./ui-plane-targets.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const name = process.env.FREAC_TEST_BROWSER ?? "chromium";
let server, browser, app, page;
try {
  if (name === "electron") {
    app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
    page = await app.firstWindow();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0 } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await orientationCubeRoute(page, name);
  await cameraRoute(page, name);
  await trackballRoute(page, name);
  await planeTargetsRoute(page, name);
  await redrawRoute(page, name);
} catch (error) {
  await page?.screenshot({ path: `.cache/sketch-review/${name}-camera-failure.png` });
  console.log(
    await page?.evaluate(() => ({
      selection: window.freacInspect().modelingSelection,
      notice: document.querySelector("[role=status]")?.textContent,
    })),
  );
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
