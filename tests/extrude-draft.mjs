import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";
import { extrudeDraftRoute } from "./ui-extrude-draft.mjs";
import { extrusionWidgetRoute } from "./ui-extrude-widget.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of ["chromium", "webkit", "electron"].filter(
    (n) => !process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === n,
  )) {
    let browser, app;
    try {
      let page;
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
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        await page.goto(server.resolvedUrls.local[0]);
      }
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await autoUnionRoute(page, name);
      await extrudeDraftRoute(page, name, app);
      await extrudeRoute(page, name, app);
      await extrusionWidgetRoute(page, name);
      if (errors.length) throw new Error(errors.join("\n"));
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
