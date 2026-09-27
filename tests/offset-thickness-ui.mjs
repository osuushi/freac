import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { offsetThicknessRoute } from "./ui-offset-thickness.mjs";

const name = process.env.FREAC_TEST_BROWSER ?? "chromium";
let server, browser;
try {
  server = await createServer({ server: { port: 0, watch: null, hmr: false } });
  await server.listen();
  browser = await { chromium, webkit }[name].launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto(server.resolvedUrls.local[0]);
  await offsetThicknessRoute(page);
  await faceOffsetRoute(page, name, false);
} finally {
  await browser?.close();
  await server?.close();
}
