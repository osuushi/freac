import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { transformFollowupRoute } from "./ui-transform-followup.mjs";

const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    let page;
    try {
      page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      page.setDefaultTimeout(12000);
      await page.goto(server.resolvedUrls.local[0]);
      await transformFollowupRoute(page, name);
    } catch (error) {
      console.log(
        await page?.evaluate(() => ({
          interaction: window.freacInspect().interaction,
          moveMode: window.freacInspect().moveMode,
          status: document.querySelector("[role=status]")?.textContent,
        })),
      );
      throw error;
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
