import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { moveWidgetRoute } from "./ui-move-widget.mjs";
import { shadowHoleRoute } from "./ui-shadow-hole.mjs";
import { shadowSketchRoute } from "./ui-shadow-sketch.mjs";
import { transformFollowupRoute } from "./ui-transform-followup.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FREAC_TEST_BROWSER && process.env.FREAC_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.setDefaultTimeout(15000);
      await page.goto(server.resolvedUrls.local[0]);
      await shadowHoleRoute(page, name);
      await moveWidgetRoute(page, name);
      await transformFollowupRoute(page, name);
      await shadowSketchRoute(page, name);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
