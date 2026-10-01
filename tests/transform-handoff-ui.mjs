import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { transformFollowupRoute } from "./ui-transform-followup.mjs";
import { transformHandoffRoute } from "./ui-transform-handoff.mjs";

const names = ["chromium", "webkit", "electron"].filter(
  (name) => !process.env.FREAC_TEST_BROWSER || process.env.FREAC_TEST_BROWSER === name,
);
assert.ok(names.length, `Unsupported FREAC_TEST_BROWSER: ${process.env.FREAC_TEST_BROWSER}`);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const name of names) {
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
      page.setDefaultTimeout(12000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (name !== "electron") await transformHandoffRoute(page, name);
      await transformFollowupRoute(page, name);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
