import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { blendEditRoute } from "./ui-blend-edit.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { extrusionWidgetRoute } from "./ui-extrude-widget.mjs";
import { offsetPlacementRoute } from "./ui-offset-placement.mjs";
import { orientableFaceOffsetRoute, orientableSketchOffsetRoute } from "./ui-orientable-offset.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { shellRoute } from "./ui-shell.mjs";
import { standaloneRotationRoute } from "./ui-standalone-rotation.mjs";
import { transformRoute } from "./ui-transform.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const name = process.env.FREAC_TEST_BROWSER ?? "chromium";
let server, browser, app, page;
try {
  server = await createServer({ server: { port: 0, watch: null } });
  await server.listen();
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        FREAC_TEST_HIDDEN: "1",
        FREAC_DEV_URL: server.resolvedUrls.local[0],
      },
    });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 850),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const routes = {
    extrusionWidgetRoute,
    bodyFilletRoute,
    bodyChamferRoute,
    orientableFaceOffsetRoute,
    offsetPlacementRoute,
    blendEditRoute,
    shellRoute,
    revolveRoute,
    orientableSketchOffsetRoute,
    transformRoute,
    standaloneRotationRoute,
  };
  for (const [label, route] of Object.entries(routes)) {
    if (process.env.FREAC_TOOL_ROUTE && !process.env.FREAC_TOOL_ROUTE.split(",").includes(label))
      continue;
    console.log(`${name}: starting ${label}`);
    await route(page, name, app);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page?.screenshot({ path: `.cache/sketch-review/${name}-orientable-failure.png` });
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
