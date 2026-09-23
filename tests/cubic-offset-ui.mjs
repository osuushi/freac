import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { cubicOffsetRoute } from "./ui-cubic-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { offsetAdjacentRoute } from "./ui-offset-regressions.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  const engines =
    process.env.FREAC_TEST_BROWSER === "electron" ? { electron: null } : { chromium, webkit };
  for (const [name, engine] of Object.entries(engines)) {
    const browser = engine ? await engine.launch({ headless: true }) : null;
    const app = engine
      ? null
      : await launchElectron({
          args: [process.cwd()],
          env: {
            ...process.env,
            FREAC_TEST_HIDDEN: "1",
            FREAC_DEV_URL: server.resolvedUrls.local[0],
          },
        });
    try {
      const page = app
        ? await app.firstWindow()
        : await browser.newPage({ viewport: { width: 1280, height: 2000 } });
      // Analytic offset routes draw odd integer dimensions: keep a 1 mm grid.
      if (app)
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].setContentSize(1280, 2000),
        );
      page.setDefaultTimeout(20000);
      if (!app) await page.goto(server.resolvedUrls.local[0]);
      await inspect(page);
      await cubicOffsetRoute(page, name);
      await offsetAdjacentRoute(page, name);
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server.close();
}
