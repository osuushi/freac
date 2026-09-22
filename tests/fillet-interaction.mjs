import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { filletLossRoute, filletRoute } from "./ui-fillet.mjs";
import { filletCursorRoute } from "./ui-fillet-cursor.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of ["chromium", "webkit", "electron"].filter(
    (n) => !process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === n,
  )) {
    let browser, app, page;
    try {
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
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await filletCursorRoute(page, name);
      await filletRoute(page, name);
      await filletLossRoute(page, name);
      if (errors.length) throw new Error(errors.join("\n"));
    } catch (error) {
      await page?.screenshot({ path: `.cache/sketch-review/${name}-fillet-failure.png` });
      throw error;
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
