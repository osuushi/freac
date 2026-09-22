import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { fixtureRoute } from "./ui-fixture.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of ["chromium", "webkit", "electron", "electron-built"]) {
    let browser, app;
    try {
      let page;
      if (name.startsWith("electron")) {
        app = await launchElectron({
          args: ["."],
          env: {
            ...process.env,
            FREAC_TEST_HIDDEN: "1",
            FREAC_DEV_URL: name === "electron-built" ? "" : server.resolvedUrls.local[0],
          },
        });
        page = await app.firstWindow();
      } else {
        browser = await { chromium, webkit }[name].launch({ headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
        await page.goto(server.resolvedUrls.local[0]);
      }
      page.setDefaultTimeout(10000);
      await fixtureRoute(page, name);
      const denied = await page.request.post(
        new URL("/__freac_fixture", server.resolvedUrls.local[0]).href,
        {
          headers: { origin: "https://example.com", "content-type": "application/json" },
          data: { document: {} },
        },
      );
      if (denied.status() !== 403) throw new Error("Cross-origin fixture request was not rejected");
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
