import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { bodyMoveRoute } from "./ui-body-move.mjs";
import { faceMoveRoute, planarFaceMoveRoute } from "./ui-face-move.mjs";
import { cylinderFaceMoveRoute } from "./ui-face-move-cylinder.mjs";
import { roundedFaceMoveRoute } from "./ui-face-move-rounded.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const name = process.env.FREAC_TEST_BROWSER ?? "chromium";
let server, browser, app;
try {
  let page;
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
  if (process.env.FREAC_FACE_SHARED_ONLY) {
    await roundedFaceMoveRoute(page, name, app, "shared-cylinder-move");
  } else if (process.env.FREAC_FACE_GENERAL_ONLY) {
    await roundedFaceMoveRoute(page, name, app);
    await planarFaceMoveRoute(page, name, false, -6);
    await planarFaceMoveRoute(page, name, true, -6, true);
    await planarFaceMoveRoute(page, name, true, 4, true);
  } else if (process.env.FREAC_FACE_FEATURES_ONLY) {
    for (const sides of process.env.FREAC_FACE_ROUND_ONLY ? [0] : [3, 6, 0])
      for (const pocket of [false, true]) await planarFaceMoveRoute(page, name, pocket, sides);
  } else {
    await cylinderFaceMoveRoute(page, name);
    if (!process.env.FREAC_FACE_PLANAR_ONLY && !process.env.FREAC_FACE_CYLINDER_ONLY)
      await faceMoveRoute(page, name, app);
    if (!process.env.FREAC_FACE_HOLE_ONLY && !process.env.FREAC_FACE_CYLINDER_ONLY) {
      await planarFaceMoveRoute(page, name);
      await planarFaceMoveRoute(page, name, true);
      await bodyMoveRoute(page, name);
      await faceOffsetRoute(page, name, app);
      await autoUnionRoute(page, name);
    }
  }
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
