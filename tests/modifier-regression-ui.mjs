import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { bodyMoveRoute, bodySnapRoute } from "./ui-body-move.mjs";
import { drawingLinksRoute } from "./ui-drawing-links.mjs";
import {
  movementGeometrySnapRoute,
  movementSnappingRoute,
  rotatedEdgeRoute,
} from "./ui-movement-snapping.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { widgetNavigationRoute } from "./ui-widget-navigation.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
async function run(page, name) {
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const route = process.env.FREAC_MODIFIER_ROUTE;
    if (!route || route === "rectangle") await rectangleRoute(page, name);
    if (!route || route === "attachments") await drawingLinksRoute(page, name);
    if (!route || route === "movement") {
      await movementSnappingRoute(page, name);
      await movementGeometrySnapRoute(page, name);
      await rotatedEdgeRoute(page, name);
    }
    if (!route || route === "body") {
      await bodyMoveRoute(page, name);
      await bodySnapRoute(page, name);
      await widgetNavigationRoute(page, name);
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: `.cache/sketch-review/${name}-modifier-regression-failure.png` });
    console.log(
      await page.evaluate(() => ({
        state: window.freacInspect(),
        status: document.querySelector(".status")?.textContent,
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
      await run(await app.firstWindow(), "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
