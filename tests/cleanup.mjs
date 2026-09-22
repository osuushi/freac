import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { cleanupRoute } from "./ui-cleanup.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { revolveRoute } from "./ui-revolve.mjs";

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
      await cleanupRoute(
        page,
        process.env.FREAC_CLEANUP_FIXTURE ? `${name}-fixture` : name,
        app,
        process.env.FREAC_CLEANUP_FIXTURE,
      );
      if (!process.env.FREAC_CLEANUP_FIXTURE) {
        await bodyFilletRoute(page, name, app, true);
        await faceOffsetRoute(page, name, app, true);
        await revolveRoute(page, name, app, true);
      }
      if (errors.length) throw new Error(errors.join("\n"));
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
